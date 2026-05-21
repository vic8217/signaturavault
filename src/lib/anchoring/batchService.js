import { generateId, now } from '@/lib/db';
import {
	buildMerkleTree,
	documentLeafHash,
	proofForLeaf,
	verifyMerkleProof,
} from '@/lib/anchoring/merkle';
import { createPublisher } from '@/lib/anchoring/publishers';

function pendingPoolRecords(db, limit = Number(process.env.ANCHOR_BATCH_SIZE || 100)) {
	return [...(db.anchor_pool || [])]
		.filter((record) => record.status === 'pending')
		.sort((a, b) => {
			const created = new Date(a.created_at) - new Date(b.created_at);
			return created || String(a.id).localeCompare(String(b.id));
		})
		.slice(0, limit);
}

function createMerkleBatch(db, options = {}) {
	const pending = pendingPoolRecords(db, options.limit);
	if (pending.length === 0) return null;

	const leaves = pending.map((record, index) => ({
		anchorPoolId: record.id,
		documentId: record.document_id,
		documentHash: record.document_hash,
		leafHash: documentLeafHash(record.document_hash, record.document_id),
		proofIndex: index,
	}));
	const { merkleRoot, levels } = buildMerkleTree(leaves);
	const batchId = generateId('batch');
	const timestamp = now();

	db.merkle_batches.push({
		id: batchId,
		merkle_root: merkleRoot,
		batch_size: leaves.length,
		status: 'created',
		publish_method: options.publishMethod || process.env.ANCHOR_PUBLISH_METHOD || 'mock',
		chain: null,
		transaction_id: null,
		block_number: null,
		timestamp_proof: null,
		published_at: null,
		created_at: timestamp,
		updated_at: timestamp,
	});

	for (const leaf of leaves) {
		db.merkle_proofs.push({
			id: generateId('proof'),
			document_id: leaf.documentId,
			batch_id: batchId,
			leaf_hash: leaf.leafHash,
			proof_path: proofForLeaf(levels, leaf.proofIndex),
			proof_index: leaf.proofIndex,
			created_at: timestamp,
		});

		const poolRecord = db.anchor_pool.find((record) => record.id === leaf.anchorPoolId);
		if (poolRecord) {
			poolRecord.status = 'batched';
			poolRecord.updated_at = timestamp;
		}

		const document = db.document_records.find((record) => record.id === leaf.documentId);
		if (document) {
			document.anchor_status = 'batched';
			document.anchor_batch_id = batchId;
			document.updated_at = timestamp;
		}
	}

	return db.merkle_batches.find((batch) => batch.id === batchId);
}

function markBatchDocumentsPublished(db, batch, timestamp = now()) {
	for (const proof of db.merkle_proofs.filter((item) => item.batch_id === batch.id)) {
		const document = db.document_records.find((record) => record.id === proof.document_id);
		if (document) {
			document.anchor_status = 'published';
			document.anchor_batch_id = batch.id;
			document.updated_at = timestamp;
		}
		const poolRecord = db.anchor_pool.find(
			(record) => record.document_id === proof.document_id,
		);
		if (poolRecord) {
			poolRecord.status = 'anchored';
			poolRecord.updated_at = timestamp;
		}
	}
}

function applyPublishResult(db, batch, result) {
	const timestamp = now();
	batch.publish_method = result.publishMethod;
	batch.chain = result.chain || null;
	batch.transaction_id = result.transactionId || null;
	batch.block_number = result.blockNumber || null;
	batch.timestamp_proof = result.timestampProof || null;
	batch.published_at = result.publishedAt || null;
	batch.status = result.status || 'failed';
	batch.updated_at = timestamp;

	if (batch.status === 'published') {
		batch.published_at = batch.published_at || timestamp;
		markBatchDocumentsPublished(db, batch, timestamp);
	}

	return batch;
}

async function publishMerkleBatch(db, batchId, options = {}) {
	const batch = db.merkle_batches.find((record) => record.id === batchId);
	if (!batch) throw new Error('Merkle batch not found');
	if (batch.status === 'published' && !options.force) return batch;

	batch.status = 'publishing';
	batch.updated_at = now();

	try {
		const publisher = options.publisher || createPublisher(options.publishMethod || batch.publish_method);
		const result = await publisher.publishMerkleRoot({
			batchId: batch.id,
			merkleRoot: batch.merkle_root,
			batchSize: batch.batch_size,
		});
		return applyPublishResult(db, batch, result);
	} catch (error) {
		batch.status = 'failed';
		batch.updated_at = now();
		batch.error_message = error instanceof Error ? error.message : 'Publishing failed';
		for (const proof of db.merkle_proofs.filter((item) => item.batch_id === batch.id)) {
			const document = db.document_records.find((record) => record.id === proof.document_id);
			if (document) {
				document.anchor_status = 'failed';
				document.updated_at = now();
			}
			const poolRecord = db.anchor_pool.find((record) => record.document_id === proof.document_id);
			if (poolRecord) {
				poolRecord.status = 'failed';
				poolRecord.updated_at = now();
			}
		}
		throw error;
	}
}

async function upgradeOpenTimestampsBatch(db, batchId, options = {}) {
	const batch = db.merkle_batches.find((record) => record.id === batchId);
	if (!batch) throw new Error('Merkle batch not found');
	if (batch.publish_method !== 'opentimestamps') {
		throw new Error('Batch was not published with OpenTimestamps');
	}
	if (!batch.timestamp_proof) {
		throw new Error('OpenTimestamps proof is missing');
	}

	const publisher = options.publisher || createPublisher('opentimestamps');
	const result = await publisher.upgradeTimestampProof({
		merkleRoot: batch.merkle_root,
		timestampProof: batch.timestamp_proof,
	});
	batch.timestamp_proof = result.timestampProof;
	batch.block_number = result.blockNumber || batch.block_number || null;
	batch.updated_at = now();

	if (result.verified) {
		batch.status = 'published';
		batch.chain = 'bitcoin_timestamp';
		batch.published_at = result.publishedAt || now();
		markBatchDocumentsPublished(db, batch);
	} else {
		batch.status = 'timestamped_pending_confirmation';
	}

	return batch;
}

async function upgradePendingOpenTimestampsBatches(db, options = {}) {
	const pending = (db.merkle_batches || []).filter(
		(batch) =>
			batch.publish_method === 'opentimestamps' &&
			batch.status === 'timestamped_pending_confirmation' &&
			batch.timestamp_proof,
	);
	const results = [];

	for (const batch of pending) {
		try {
			const upgraded = await upgradeOpenTimestampsBatch(db, batch.id, options);
			results.push({ batchId: upgraded.id, status: upgraded.status, ok: true });
		} catch (error) {
			batch.error_message =
				error instanceof Error ? error.message : 'OpenTimestamps upgrade failed';
			batch.updated_at = now();
			results.push({ batchId: batch.id, status: batch.status, ok: false, error: batch.error_message });
		}
	}

	return results;
}

async function verifyOpenTimestampsBatchProof(batch, options = {}) {
	if (batch.publish_method !== 'opentimestamps' || !batch.timestamp_proof) {
		return { verified: false };
	}
	const publisher = options.publisher || createPublisher('opentimestamps');
	return publisher.verifyTimestampProof({
		merkleRoot: batch.merkle_root,
		timestampProof: batch.timestamp_proof,
	});
}

async function createAndPublishMerkleBatch(db, options = {}) {
	const batch = createMerkleBatch(db, options);
	if (!batch) return null;
	return publishMerkleBatch(db, batch.id, options);
}

function verifyDocumentMerkleProof(db, document) {
	const proof = (db.merkle_proofs || []).find((item) => item.document_id === document.id);
	if (!proof) return { proof: null, batch: null, valid: false };
	const batch = (db.merkle_batches || []).find((item) => item.id === proof.batch_id);
	if (!batch) return { proof, batch: null, valid: false };

	const leafHash = documentLeafHash(
		document.document_hash || document.hash,
		document.id,
	);
	const valid =
		leafHash === proof.leaf_hash &&
		verifyMerkleProof({
			leafHash,
			proofPath: proof.proof_path,
			merkleRoot: batch.merkle_root,
		});

	return { proof, batch, valid, leafHash };
}

export {
	createAndPublishMerkleBatch,
	createMerkleBatch,
	publishMerkleBatch,
	upgradeOpenTimestampsBatch,
	upgradePendingOpenTimestampsBatches,
	verifyDocumentMerkleProof,
	verifyOpenTimestampsBatchProof,
};
