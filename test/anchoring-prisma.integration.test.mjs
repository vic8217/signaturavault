import assert from 'node:assert/strict';
import test from 'node:test';

import {
	createAndPublishMerkleBatch,
	createMerkleBatch,
	getAdminAnchoringSummary,
	publishMerkleBatch,
	verifyDocumentMerkleProof,
	verifyMerkleBatchProofs,
} from '../src/lib/anchoring/batchService.js';
import {
	createDocumentRecord,
	verifyPublicDocumentByToken,
	verifyTenantDocumentRecord,
} from '../src/lib/document-records.js';
import { prisma, resetHarness } from './harness/state.mjs';

const TENANT_ID = 'tenant_anchoring_prisma';
const ISSUER_ID = 'issuer_anchoring_prisma';
const DOCUMENT_HASH = 'sha256:anchoringprismahashvalue123';

function seedTenantFixtures() {
	resetHarness({
		issuer: [
			{
				id: ISSUER_ID,
				tenantId: TENANT_ID,
				name: 'Anchoring Prisma University',
				status: 'active',
				acceptsRequests: true,
			},
		],
	});
}

function emptyJsonDb() {
	return {
		anchor_pool: [],
		document_records: [],
		merkle_batches: [],
		merkle_proofs: [],
	};
}

test('Prisma AnchorPool pending row is batched and published', async () => {
	seedTenantFixtures();
	const created = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	const poolBefore = prisma.anchorPool.__rows.find(
		(row) => row.documentId === created.documentId,
	);
	assert.equal(poolBefore.status, 'pending');

	const batch = await createAndPublishMerkleBatch(emptyJsonDb(), {
		publishMethod: 'audit_anchor',
	});
	assert.ok(batch);
	assert.equal(batch.status, 'published');

	const poolAfter = prisma.anchorPool.__rows.find(
		(row) => row.documentId === created.documentId,
	);
	assert.equal(poolAfter.status, 'anchored');

	const record = prisma.documentRecord.__rows.find((row) => row.id === created.documentId);
	assert.equal(record.anchorStatus, 'published');
	assert.equal(record.anchorBatchId, batch.id);
});

test('MerkleProof row is created for Prisma batched document', async () => {
	seedTenantFixtures();
	const created = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	await createAndPublishMerkleBatch(emptyJsonDb(), { publishMethod: 'audit_anchor' });

	const proof = prisma.merkleProof.__rows.find(
		(row) => row.documentId === created.documentId,
	);
	assert.ok(proof);
	assert.equal(proof.leafHash.length > 0, true);
	assert.ok(prisma.merkleBatch.__rows.some((row) => row.id === proof.batchId));
});

test('public verify shows proof metadata for anchored Prisma document', async () => {
	seedTenantFixtures();
	const created = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});
	await createAndPublishMerkleBatch(emptyJsonDb(), { publishMethod: 'audit_anchor' });

	const result = await verifyPublicDocumentByToken(created.verificationToken);
	assert.equal(result.status, 200);
	assert.equal(result.body.merkle_proof_available, true);
	assert.ok(result.body.batch);
	assert.equal(result.body.batch.status, 'published');
	assert.equal(result.body.private_data_redacted, true);
});

test('tenant verify validates proof metadata for anchored Prisma document', async () => {
	seedTenantFixtures();
	const created = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});
	await createAndPublishMerkleBatch(emptyJsonDb(), { publishMethod: 'audit_anchor' });

	const result = await verifyTenantDocumentRecord({
		tenantId: TENANT_ID,
		token: created.verificationToken,
	});

	assert.equal(result.status, 200);
	assert.equal(result.body.merkleProofValid, true);
	assert.equal(result.body.publicCommitmentValid, true);
	assert.equal(result.body.anchorStatus, 'published');
	assert.ok(result.body.batchId);
});

test('admin anchoring summary includes Prisma pool and batch counts', async () => {
	seedTenantFixtures();
	await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});
	await createAndPublishMerkleBatch(emptyJsonDb(), { publishMethod: 'audit_anchor' });

	const summary = await getAdminAnchoringSummary(emptyJsonDb());
	assert.equal(summary.pendingAnchorCount, 0);
	assert.equal(summary.anchoredCount >= 1, true);
	assert.equal(summary.latestBatches.length >= 1, true);
});

test('verifyMerkleBatchProofs validates Prisma batch proofs', async () => {
	seedTenantFixtures();
	await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});
	const batch = await createAndPublishMerkleBatch(emptyJsonDb(), {
		publishMethod: 'audit_anchor',
	});

	const result = await verifyMerkleBatchProofs(batch.id, emptyJsonDb());
	assert.equal(result.status, 200);
	assert.equal(result.body.merkleProofsValid, true);
	assert.equal(result.body.publicCommitmentValid, true);
});

test('JSON legacy anchoring fallback still reads old anchored records', async () => {
	resetHarness();
	const db = {
		anchor_pool: [
			{
				id: 'pool-legacy',
				document_id: 'doc-legacy',
				document_hash: 'abc123legacyhash',
				status: 'pending',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
		],
		document_records: [
			{
				id: 'doc-legacy',
				tenant_id: TENANT_ID,
				hash: 'abc123legacyhash',
				document_hash: 'abc123legacyhash',
				status: 'valid',
				anchor_status: 'pending',
				verification_token: 'verify-legacy-token',
				qr_token: 'qr-legacy-token',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
		],
		merkle_batches: [],
		merkle_proofs: [],
	};

	const batch = createMerkleBatch(db, { publishMethod: 'audit_anchor' });
	assert.ok(batch);
	await publishMerkleBatch(db, batch.id, { publishMethod: 'audit_anchor' });

	const document = db.document_records[0];
	const { valid } = verifyDocumentMerkleProof(db, document);
	assert.equal(valid, true);
});
