import { withDb } from '@/lib/db';
import { requireAdminRole } from '@/lib/admin-auth';
import {
	verifyDocumentMerkleProof,
	verifyOpenTimestampsBatchProof,
} from '@/lib/anchoring/batchService';

export async function POST(_req, { params }) {
	const auth = await requireAdminRole();
	if (auth.error) return auth.error;

	const { id } = await params;
	return withDb(async (db) => {
		const batch = (db.merkle_batches || []).find((record) => record.id === id);
		if (!batch) {
			return Response.json({ error: 'Merkle batch not found' }, { status: 404 });
		}

		const proofs = (db.merkle_proofs || []).filter((proof) => proof.batch_id === id);
		const proofResults = proofs.map((proof) => {
			const document = db.document_records.find((record) => record.id === proof.document_id);
			const result = document
				? verifyDocumentMerkleProof(db, document)
				: { valid: false, leafHash: null };
			return {
				documentId: proof.document_id,
				leafHash: proof.leaf_hash,
				recomputedLeafHash: result.leafHash || null,
				valid: Boolean(result.valid),
			};
		});
		let publicCommitmentValid = Boolean(
			batch.status === 'published' &&
				batch.transaction_id &&
				batch.chain &&
				batch.block_number,
		);
		let opentimestampsVerification = null;
		if (batch.status === 'published' && batch.publish_method === 'mock') {
			publicCommitmentValid = Boolean(batch.timestamp_proof);
		}
		if (batch.publish_method === 'opentimestamps' && batch.timestamp_proof) {
			opentimestampsVerification = await verifyOpenTimestampsBatchProof(batch).catch((error) => ({
				verified: false,
				error: error instanceof Error ? error.message : 'OpenTimestamps verification failed',
			}));
			publicCommitmentValid = Boolean(
				batch.status === 'published' && opentimestampsVerification.verified,
			);
		}

		return Response.json({
			batchId: batch.id,
			merkleRoot: batch.merkle_root,
			status: batch.status,
			proofCount: proofResults.length,
			validProofCount: proofResults.filter((result) => result.valid).length,
			merkleProofsValid: proofResults.every((result) => result.valid),
			publicCommitmentValid,
			opentimestampsVerification,
			proofResults,
		});
	});
}
