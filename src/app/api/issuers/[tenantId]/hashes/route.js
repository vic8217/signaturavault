import { authenticateApiRequest } from '@/lib/auth';
import { withDb, generateId, now } from '@/lib/db';

export async function POST(req, { params }) {
	const { tenantId } = params;
	const auth = await authenticateApiRequest(req, tenantId);
	if (!auth) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
		});
	}

	const payload = await req.json();
	const { documentId, documentHash } = payload;

	if (!documentId || !documentHash) {
		return new Response(
			JSON.stringify({ error: 'documentId and documentHash are required' }),
			{ status: 400 },
		);
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
		record.hash = documentHash;
		record.updated_at = now();

		db.blockchain_anchors.push({
			id: generateId('anchor'),
			tenant_id: tenantId,
			document_record_id: documentId,
			anchor_hash: documentHash,
			chain: 'placeholder-chain',
			transaction_id: null,
			status: 'pending',
			created_at: now(),
			updated_at: now(),
		});

		db.api_logs.push({
			id: generateId('apilog'),
			tenant_id: tenantId,
			api_client_id: auth.client.id,
			path: req.url,
			method: req.method,
			status: 200,
			request_body: payload,
			response_body: { message: 'hash submitted' },
			created_at: now(),
		});

		return new Response(JSON.stringify({ message: 'hash submitted' }), {
			status: 200,
		});
	});
}
