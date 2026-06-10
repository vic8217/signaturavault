import { generateId, now } from '@/lib/db';
import {
	buildMerkleTree,
	documentLeafHash,
	proofForLeaf,
	verifyMerkleProof,
} from '@/lib/anchoring/merkle';
import { createPublisher, verifyAnchorCommitment } from '@/lib/anchoring/publishers';

function pendingPoolRecords(db, limit = Number(process.env.ANCHOR_BATCH_SIZE || 100)) {
	return [...(db.anchor_pool || [])]
		.filter((record) => record.status === 'pending')
		.sort((a, b) => {
			const created = new Date(a.created_at) - new Date(b.created_at);
			return created || String(a.id).localeCompare(String(b.id));
		})
		.slice(0, limit);
}

function resolvePublishMethod(method) {
	const publishMethod = method || process.env.ANCHOR_PUBLISH_METHOD || 'audit_anchor';
	const normalized =
		publishMethod === 'mock' || publishMethod === 'opentimestamps'
			? 'audit_anchor'
			: publishMethod;
	if (process.env.NODE_ENV === 'production' && normalized === 'mock') {
		throw new Error('ANCHOR_PUBLISH_METHOD must not be mock in production');
	}
	return normalized;
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
		publish_method: resolvePublishMethod(options.publishMethod),
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
		const publisher =
			options.publisher ||
			createPublisher(resolvePublishMethod(options.publishMethod || batch.publish_method));
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

function verifyBatchPublicCommitment(batch) {
	if (!batch || batch.status !== 'published') {
		return { verified: false, method: batch?.publish_method || null };
	}

	if (batch.transaction_id && batch.chain && batch.block_number) {
		return {
			verified: true,
			method: batch.publish_method,
			chain: batch.chain,
			blockNumber: batch.block_number,
			publishedAt: batch.published_at || null,
		};
	}

	if (batch.timestamp_proof) {
		const anchorVerification = verifyAnchorCommitment({
			merkleRoot: batch.merkle_root,
			timestampProof: batch.timestamp_proof,
		});
		if (anchorVerification.verified) {
			return {
				verified: true,
				method: batch.publish_method,
				chain: anchorVerification.chain,
				blockNumber: anchorVerification.blockNumber,
				publishedAt: anchorVerification.publishedAt,
				legacy: batch.publish_method === 'opentimestamps',
			};
		}
	}

	// Legacy OpenTimestamps batches remain verifiable via Merkle proof + published status
	// even though Bitcoin timestamp re-verification is no longer performed.
	if (batch.publish_method === 'opentimestamps') {
		return {
			verified: true,
			method: 'opentimestamps_legacy',
			chain: batch.chain || 'bitcoin_timestamp_legacy',
			blockNumber: batch.block_number,
			publishedAt: batch.published_at || null,
			legacy: true,
		};
	}

	return {
		verified: Boolean(batch.timestamp_proof || batch.transaction_id),
		method: batch.publish_method,
		chain: batch.chain,
		blockNumber: batch.block_number,
		publishedAt: batch.published_at || null,
	};
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
	verifyBatchPublicCommitment,
	verifyDocumentMerkleProof,
};
