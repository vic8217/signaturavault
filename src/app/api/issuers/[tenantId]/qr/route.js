import { authenticateApiRequest } from '@/lib/auth';
import { withDb, generateId, now } from '@/lib/db';
import { safeApiLogEntry } from '@/lib/security';

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

	return withDb(async (db) => {
		const record = db.document_records.find(
			(doc) => doc.id === documentId && doc.tenant_id === tenantId,
		);
		if (!record) {
			return new Response(JSON.stringify({ error: 'Document not found' }), {
				status: 404,
			});
		}

		const qrToken = generateId('qr');
		record.qr_token = qrToken;
		record.updated_at = now();

		db.api_logs.push(
			safeApiLogEntry({
				id: generateId('apilog'),
				tenantId,
				apiClientId: auth.client.id,
				req,
				status: 200,
				requestBody: { action: 'document_qr_rotated', documentId },
				responseBody: { message: 'qr rotated' },
				createdAt: now(),
			}),
		);

		return new Response(
			JSON.stringify({
				qrToken,
				qrUrl: `/api/issuers/${tenantId}/verify?token=${qrToken}`,
			}),
			{ status: 200 },
		);
	});
}
