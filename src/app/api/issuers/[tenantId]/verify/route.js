import { authenticateApiRequest } from '@/lib/auth';
import { withDb, generateId, now } from '@/lib/db';
import { redactedDocumentVerification, safeApiLogEntry } from '@/lib/security';
import {
	verifyBatchPublicCommitment,
	verifyDocumentMerkleProof,
} from '@/lib/anchoring/batchService';

export async function GET(req, { params }) {
	const { tenantId } = await params;
	const token = new URL(req.url).searchParams.get('token');

	if (!token) {
		return new Response(JSON.stringify({ error: 'token is required' }), {
			status: 400,
		});
	}

	return withDb(async (db) => {
		const record = db.document_records.find(
			(doc) =>
				doc.tenant_id === tenantId &&
				(doc.verification_token === token || doc.qr_token === token),
		);

		if (!record) {
			return new Response(
				JSON.stringify({ error: 'Verification token not found' }),
				{ status: 404 },
			);
		}

		const storedHash = record.document_hash || record.hash;
		const documentHashMatch = Boolean(storedHash && storedHash === record.hash);
		const { proof, batch, valid: merkleProofValid } = verifyDocumentMerkleProof(
			db,
			record,
		);
		const commitmentVerification = batch ? verifyBatchPublicCommitment(batch) : { verified: false };
		const publicCommitmentValid = Boolean(
			merkleProofValid && commitmentVerification.verified,
		);
		const documentStatus = record.status || 'valid';
		const tokenRow = db.verification_tokens.find(
			(item) => item.token === token && item.document_record_id === record.id,
		);
		const tokenValid =
			(record.verification_token === token || record.qr_token === token) &&
			(!tokenRow ||
				(tokenRow.status === 'active' && new Date(tokenRow.expires_at) > new Date()));

		if (!documentHashMatch || !proof || !batch) {
			return new Response(
				JSON.stringify({
					tokenValid,
					documentHashMatch,
					documentStatus,
					anchorStatus: record.anchor_status || 'pending',
					merkleProofValid: false,
					publicCommitmentValid: false,
					error: 'Document hash mismatch or Merkle proof missing',
				}),
				{ status: 400 },
			);
		}

		const status = documentStatus === 'revoked' ? 'revoked' : documentStatus;

		db.api_logs.push(
			safeApiLogEntry({
				id: generateId('apilog'),
				tenantId,
				req,
				status: 200,
				requestBody: { action: 'document_verification_checked' },
				responseBody: {
					tokenValid,
					documentHashMatch,
					documentStatus: status,
					anchorStatus: record.anchor_status,
					merkleProofValid,
					publicCommitmentValid,
				},
				createdAt: now(),
			}),
		);

		return new Response(
			JSON.stringify({
				tokenValid,
				documentHashMatch,
				documentStatus: status,
				anchorStatus: record.anchor_status || 'pending',
				merkleProofValid,
				publicCommitmentValid,
				publishMethod: batch.publish_method,
				chain: commitmentVerification.chain || batch.chain,
				batchId: batch.id,
				merkleRoot: batch.merkle_root,
				transactionId: batch.transaction_id,
				blockNumber: commitmentVerification.blockNumber || batch.block_number,
				anchorCommitmentAvailable: Boolean(batch.timestamp_proof),
				legacyAnchor: Boolean(commitmentVerification.legacy),
				...redactedDocumentVerification(record),
				status,
				qrToken: record.qr_token,
			}),
			{ status: 200 },
		);
	});
}

export async function POST(req, { params }) {
	const { tenantId } = await params;
	const auth = await authenticateApiRequest(req, tenantId);
	if (!auth) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
		});
	}
	return GET(req, { params });
}
