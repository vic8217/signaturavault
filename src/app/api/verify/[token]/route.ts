import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { REDACTED } from '@/lib/security';

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ token: string }> },
) {
	try {
		const { token } = await params;
		if (!token) return jsonError('Verification token is required');

		const record = await prisma.documentRecord.findFirst({
			where: {
				OR: [{ verificationToken: token }, { qrToken: token }],
			},
			select: {
				id: true,
				externalId: true,
				recipientName: true,
				issuedAt: true,
				status: true,
				anchorStatus: true,
				hash: true,
				documentHash: true,
				verificationToken: true,
				qrToken: true,
				merkleProofs: {
					select: {
						id: true,
						leafHash: true,
						batch: {
							select: {
								id: true,
								merkleRoot: true,
								status: true,
								publishMethod: true,
								chain: true,
								transactionId: true,
								blockNumber: true,
								publishedAt: true,
							},
						},
					},
					take: 1,
				},
			},
		});

		if (!record) return jsonError('Verification token not found', 404);

		const proof = record.merkleProofs[0] || null;
		const storedHash = record.documentHash || record.hash;

		return Response.json({
			token_valid: true,
			document_hash_match: Boolean(storedHash && storedHash === record.hash),
			document_status: record.status,
			anchor_status: record.anchorStatus,
			document_id: record.id,
			external_id: REDACTED,
			recipient_name: REDACTED,
			issued_at: record.issuedAt,
			private_data_redacted: true,
			verification_token: record.verificationToken,
			qr_token: record.qrToken,
			merkle_proof_available: Boolean(proof),
			batch: proof
				? {
						id: proof.batch.id,
						merkle_root: proof.batch.merkleRoot,
						status: proof.batch.status,
						publish_method: proof.batch.publishMethod,
						chain: proof.batch.chain,
						transaction_id: proof.batch.transactionId,
						block_number: proof.batch.blockNumber,
						published_at: proof.batch.publishedAt,
					}
				: null,
		});
	} catch (error) {
		return jsonError(safeApiErrorMessage(error, 'Unable to verify token'), 400);
	}
}
