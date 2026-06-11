import { authenticateApiRequest } from '@/lib/auth';
import { rotateDocumentQrToken } from '@/lib/document-records';

export async function POST(req, { params }) {
	const { tenantId } = await params;
	const auth = await authenticateApiRequest(req, tenantId);
	if (!auth) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
		});
	}

	const payload = await req.json();
	const { documentId } = payload;

	if (!documentId) {
		return new Response(JSON.stringify({ error: 'documentId is required' }), {
			status: 400,
		});
	}

	const result = await rotateDocumentQrToken({
		tenantId,
		documentId,
		auditContext: {
			apiClientId: auth.client.id,
			path: `/api/issuers/${tenantId}/qr`,
			method: 'POST',
		},
	});

	if (result.error) {
		return new Response(JSON.stringify({ error: result.error }), {
			status: result.status || 404,
		});
	}

	return new Response(
		JSON.stringify(result.body),
		{ status: result.status || 200 },
	);
}
