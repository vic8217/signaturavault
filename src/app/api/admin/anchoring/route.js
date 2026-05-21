import { withDb } from '@/lib/db';
import { requireAdminRole } from '@/lib/admin-auth';
import { verifyDocumentMerkleProof } from '@/lib/anchoring/batchService';

function batchSummary(db, batch) {
	const proofs = (db.merkle_proofs || []).filter((proof) => proof.batch_id === batch.id);
	const validProofCount = proofs.filter((proof) => {
		const document = db.document_records.find((record) => record.id === proof.document_id);
		return document && verifyDocumentMerkleProof(db, document).valid;
	}).length;

	return {
		id: batch.id,
		merkleRoot: batch.merkle_root,
		batchSize: batch.batch_size,
		status: batch.status,
		publishMethod: batch.publish_method,
		chain: batch.chain,
		transactionId: batch.transaction_id,
		blockNumber: batch.block_number,
		timestampProofAvailable: Boolean(batch.timestamp_proof),
		publishedAt: batch.published_at,
		createdAt: batch.created_at,
		updatedAt: batch.updated_at,
		errorMessage: batch.error_message || null,
		validProofCount,
	};
}

export async function GET() {
	const auth = await requireAdminRole();
	if (auth.error) return auth.error;

	return withDb(async (db) => {
		const pendingAnchorCount = (db.anchor_pool || []).filter(
			(record) => record.status === 'pending',
		).length;
		const failedAnchorCount = (db.anchor_pool || []).filter(
			(record) => record.status === 'failed',
		).length;
		const latestBatches = [...(db.merkle_batches || [])]
			.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
			.slice(0, 20)
			.map((batch) => batchSummary(db, batch));

		return Response.json({
			pendingAnchorCount,
			failedAnchorCount,
			latestBatches,
		});
	});
}
