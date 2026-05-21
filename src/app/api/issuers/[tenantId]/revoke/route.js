import { authenticateApiRequest } from '@/lib/auth';
import { withDb, generateId, now } from '@/lib/db';

export async function POST(req, { params }) {
	const { tenantId } = await params;
	const auth = await authenticateApiRequest(req, tenantId);
	if (!auth) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
		});
	}

	const payload = await req.json();
	const { documentId, reason } = payload;
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

		record.status = 'revoked';
		record.updated_at = now();

		db.audit_logs.push({
			id: generateId('audit'),
			tenant_id: tenantId,
			issuer_id: record.tenant_id,
			user_id: auth.key.id,
			action: 'document_revoked',
			target: documentId,
			details: { reason: reason || 'manual revocation' },
			created_at: now(),
		});

		db.api_logs.push({
			id: generateId('apilog'),
			tenant_id: tenantId,
			api_client_id: auth.client.id,
			path: req.url,
			method: req.method,
			status: 200,
			request_body: payload,
			response_body: { message: 'document revoked' },
			created_at: now(),
		});

		return new Response(
			JSON.stringify({ message: 'document revoked', status: 'revoked' }),
			{ status: 200 },
		);
	});
}
