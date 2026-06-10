import assert from 'node:assert/strict';
import test from 'node:test';

import {
	verifyBatchPublicCommitment,
	verifyDocumentMerkleProof,
	createMerkleBatch,
	publishMerkleBatch,
} from '@/lib/anchoring/batchService';
import { verifyAnchorCommitment } from '@/lib/anchoring/publishers';
import { documentLeafHash } from '@/lib/anchoring/merkle';

function createDbFixture() {
	return {
		anchor_pool: [
			{
				id: 'pool-1',
				document_id: 'doc-1',
				document_hash: 'abc123hash',
				status: 'pending',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
		],
		document_records: [
			{
				id: 'doc-1',
				tenant_id: 'tenant-1',
				hash: 'abc123hash',
				document_hash: 'abc123hash',
				status: 'valid',
				anchor_status: 'pending',
				verification_token: 'verify-token-1',
				qr_token: 'qr-token-1',
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
		],
		merkle_batches: [],
		merkle_proofs: [],
	};
}

test('document verification works with SHA-256 hash and Merkle proof without OpenTimestamps', async () => {
	const db = createDbFixture();
	const batch = createMerkleBatch(db, { publishMethod: 'audit_anchor' });
	assert.ok(batch);

	await publishMerkleBatch(db, batch.id, { publishMethod: 'audit_anchor' });

	const document = db.document_records[0];
	const { valid, batch: linkedBatch } = verifyDocumentMerkleProof(db, document);
	assert.equal(valid, true);
	assert.equal(linkedBatch.status, 'published');

	const commitment = verifyBatchPublicCommitment(linkedBatch);
	assert.equal(commitment.verified, true);

	const anchor = verifyAnchorCommitment({
		merkleRoot: linkedBatch.merkle_root,
		timestampProof: linkedBatch.timestamp_proof,
	});
	assert.equal(anchor.verified, true);
	assert.equal(
		documentLeafHash(document.document_hash, document.id),
		db.merkle_proofs[0].leaf_hash,
	);
});

test('legacy OpenTimestamps batches remain verifiable via Merkle proof and published status', async () => {
	const db = createDbFixture();
	const batch = createMerkleBatch(db, { publishMethod: 'audit_anchor' });
	await publishMerkleBatch(db, batch.id, { publishMethod: 'audit_anchor' });

	const linkedBatch = db.merkle_batches.find((entry) => entry.id === batch.id);
	linkedBatch.publish_method = 'opentimestamps';
	linkedBatch.chain = 'bitcoin_timestamp';
	linkedBatch.transaction_id = null;
	linkedBatch.block_number = null;
	linkedBatch.timestamp_proof = Buffer.from('legacy-ots-proof').toString('base64');

	const { valid } = verifyDocumentMerkleProof(db, db.document_records[0]);
	assert.equal(valid, true);

	const commitment = verifyBatchPublicCommitment(linkedBatch);
	assert.equal(commitment.verified, true);
	assert.equal(commitment.legacy, true);
});
