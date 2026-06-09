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
		if (record.anchor_status === 'published') {
			return new Response(
				JSON.stringify({
					error:
						'Published document hashes cannot be edited. Create a corrected document version instead.',
				}),
				{ status: 409 },
			);
		}
		record.hash = documentHash;
		record.document_hash = documentHash;
		record.anchor_status = 'pending';
		record.anchor_batch_id = null;
		record.updated_at = now();

		db.anchor_pool = db.anchor_pool.filter(
			(poolRecord) => poolRecord.document_id !== documentId,
		);
		db.merkle_proofs = db.merkle_proofs.filter(
			(proof) => proof.document_id !== documentId,
		);
		db.anchor_pool.push({
			id: generateId('pool'),
			document_id: documentId,
			document_hash: documentHash,
			status: 'pending',
			created_at: now(),
			updated_at: now(),
		});

		db.api_logs.push(
			safeApiLogEntry({
				id: generateId('apilog'),
				tenantId,
				apiClientId: auth.client.id,
				req,
				status: 200,
				requestBody: { action: 'document_hash_submitted', documentId },
				responseBody: { message: 'hash submitted' },
				createdAt: now(),
			}),
		);

		return new Response(JSON.stringify({ message: 'hash submitted' }), {
			status: 200,
		});
	});
}
