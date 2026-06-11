import { authenticateApiRequest } from '@/lib/auth';
import { createDocumentRecord } from '@/lib/document-records';

export async function POST(req, { params }) {
	const { tenantId } = await params;
	const auth = await authenticateApiRequest(req, tenantId);
	if (!auth) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
		});
	}

	const payload = await req.json();
	const { templateId, documentHash } = payload;

	if (!documentHash) {
		return new Response(
			JSON.stringify({
				error: 'documentHash is required',
			}),
			{ status: 400 },
		);
	}

	try {
		const result = await createDocumentRecord(
			{
				tenantId,
				documentHash,
				templateId,
				ownerUserId: payload.ownerUserId,
				documentRequestId: payload.documentRequestId,
				documentTypeLabel: payload.documentTypeLabel,
			},
			{
				apiClientId: auth.client?.id || null,
				path: `/api/issuers/${tenantId}/documents`,
				method: 'POST',
			},
		);

		return new Response(
			JSON.stringify({
				documentId: result.documentId,
				status: 'valid',
				anchorStatus: 'pending',
				verificationToken: result.verificationToken,
				qrToken: result.qrToken,
				qrUrl: `/api/issuers/${tenantId}/verify?token=${result.qrToken}`,
			}),
			{ status: 201 },
		);
	} catch (error) {
		return new Response(
			JSON.stringify({
				error: error instanceof Error ? error.message : 'Unable to create document',
			}),
			{ status: 400 },
		);
	}
}
