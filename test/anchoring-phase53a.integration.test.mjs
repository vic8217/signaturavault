import assert from 'node:assert/strict';
import test from 'node:test';

import {
	createAndPublishMerkleBatch,
	createPrismaMerkleBatch,
	isPrismaDocumentEligibleForBatching,
	publishPrismaMerkleBatch,
	resetFairBatchQueueForTests,
	retryMerkleBatchPublish,
} from '../src/lib/anchoring/batchService.js';
import { createDocumentRecord } from '../src/lib/document-records.js';
import { prisma, resetHarness } from './harness/state.mjs';

const TENANT_ID = 'tenant_phase53a';
const ISSUER_ID = 'issuer_phase53a';
const DOCUMENT_HASH = 'sha256:phase53aprismadocumenthash';

function seedTenantFixtures() {
	resetHarness({
		issuer: [
			{
				id: ISSUER_ID,
				tenantId: TENANT_ID,
				name: 'Phase 5.3A University',
				status: 'active',
				acceptsRequests: true,
			},
		],
	});
}

function legacyJsonDb() {
	return {
		anchor_pool: [
			{
				id: 'pool-legacy-53a',
				document_id: 'doc-legacy-53a',
				document_hash: 'sha256:legacy53adocumenthash',
				status: 'pending',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
		],
		document_records: [
			{
				id: 'doc-legacy-53a',
				tenant_id: TENANT_ID,
				hash: 'sha256:legacy53adocumenthash',
				document_hash: 'sha256:legacy53adocumenthash',
				status: 'valid',
				anchor_status: 'pending',
				verification_token: 'verify-legacy-53a',
				qr_token: 'qr-legacy-53a',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
		],
		merkle_batches: [],
		merkle_proofs: [],
	};
}

const failingPublisher = {
	async publishMerkleRoot() {
		throw new Error('simulated publish failure');
	},
};

test('legacy JSON queue is not starved by Prisma queue', async () => {
	resetFairBatchQueueForTests('json');
	seedTenantFixtures();
	const db = legacyJsonDb();

	await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	const firstBatch = await createAndPublishMerkleBatch(db, {
		publishMethod: 'audit_anchor',
	});
	assert.ok(firstBatch);
	assert.equal(db.merkle_batches.length, 0);
	assert.equal(db.anchor_pool[0].status, 'pending');

	await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: 'sha256:phase53aseconddocumenthash',
	});

	const secondBatch = await createAndPublishMerkleBatch(db, {
		publishMethod: 'audit_anchor',
	});
	assert.ok(secondBatch);
	assert.equal(db.merkle_batches.length, 1);
	assert.equal(db.document_records[0].anchor_status, 'published');
});

test('failed Prisma batch shows failed status and error message', async () => {
	seedTenantFixtures();
	await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	const batch = await createPrismaMerkleBatch({ publishMethod: 'audit_anchor' });
	assert.ok(batch);

	await assert.rejects(
		() =>
			publishPrismaMerkleBatch(batch.id, {
				publisher: failingPublisher,
			}),
		/simulated publish failure/,
	);

	const stored = prisma.merkleBatch.__rows.find((row) => row.id === batch.id);
	assert.equal(stored.status, 'failed');
	assert.equal(stored.errorMessage, 'simulated publish failure');
});

test('failed batch can be retried without duplicating proofs', async () => {
	seedTenantFixtures();
	await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	const batch = await createPrismaMerkleBatch({ publishMethod: 'audit_anchor' });
	await assert.rejects(() =>
		publishPrismaMerkleBatch(batch.id, { publisher: failingPublisher }),
	);

	const proofCountBefore = prisma.merkleProof.__rows.filter(
		(row) => row.batchId === batch.id,
	).length;
	assert.equal(proofCountBefore, 1);

	const retried = await retryMerkleBatchPublish(batch.id, legacyJsonDb(), {
		publishMethod: 'audit_anchor',
	});
	assert.equal(retried.status, 'published');

	const proofCountAfter = prisma.merkleProof.__rows.filter(
		(row) => row.batchId === batch.id,
	).length;
	assert.equal(proofCountAfter, proofCountBefore);

	const record = prisma.documentRecord.__rows.find((row) => row.hash === DOCUMENT_HASH);
	assert.equal(record.anchorStatus, 'published');
});

test('already anchored document is not re-anchored', async () => {
	seedTenantFixtures();
	const created = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	await createAndPublishMerkleBatch(legacyJsonDb(), {
		publishMethod: 'audit_anchor',
	});

	assert.equal(await isPrismaDocumentEligibleForBatching(created.documentId), false);

	prisma.anchorPool.__rows.push({
		id: 'pool_duplicate_pending',
		documentId: created.documentId,
		documentHash: DOCUMENT_HASH,
		status: 'pending',
		createdAt: new Date(),
		updatedAt: new Date(),
	});

	const nextBatch = await createPrismaMerkleBatch({ publishMethod: 'audit_anchor' });
	assert.equal(nextBatch, null);
});
