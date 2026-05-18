import { authenticateApiRequest } from '@/lib/auth';
import { withDb, generateId, now } from '@/lib/db';

export async function GET(req, { params }) {
	const { tenantId } = params;
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

		const status = record.status === 'revoked' ? 'revoked' : 'valid';

		db.api_logs.push({
			id: generateId('apilog'),
			tenant_id: tenantId,
			api_client_id: null,
			path: req.url,
			method: req.method,
			status: 200,
			request_body: { token },
			response_body: { status },
			created_at: now(),
		});

		return new Response(
			JSON.stringify({
				documentId: record.id,
				externalId: record.external_id,
				status,
				recipientName: record.recipient_name,
				issuedAt: record.issued_at,
				qrToken: record.qr_token,
			}),
			{ status: 200 },
		);
	});
}

export async function POST(req, { params }) {
	const { tenantId } = params;
	const auth = await authenticateApiRequest(req, tenantId);
	if (!auth) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
		});
	}
	return GET(req, { params });
}
