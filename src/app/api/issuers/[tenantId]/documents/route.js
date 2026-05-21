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
	const { externalId, templateId, recipientName, documentHash, metadata } =
		payload;

	if (!externalId || !recipientName || !documentHash) {
		return new Response(
			JSON.stringify({
				error: 'externalId, recipientName, and documentHash are required',
			}),
			{ status: 400 },
		);
	}

	return withDb(async (db) => {
		const documentId = generateId('doc');
		const verificationToken = generateId('verify');
		const qrToken = generateId('qr');
		const timestamp = now();
		const issuer = db.issuers.find((record) => record.tenant_id === tenantId);

		db.document_records.push({
			id: documentId,
			tenant_id: tenantId,
			issuer_id: issuer?.id || null,
			document_template_id: templateId || null,
			external_id: externalId,
			recipient_name: recipientName,
			issued_at: timestamp,
			hash: documentHash,
			document_hash: documentHash,
			status: 'valid',
			anchor_status: 'pending',
			anchor_batch_id: null,
			verification_token: verificationToken,
			qr_token: qrToken,
			metadata: metadata || {},
			created_at: timestamp,
			updated_at: timestamp,
		});

		db.anchor_pool.push({
			id: generateId('pool'),
			document_id: documentId,
			document_hash: documentHash,
			status: 'pending',
			created_at: timestamp,
			updated_at: timestamp,
		});

		db.verification_tokens.push({
			id: generateId('verif'),
			tenant_id: tenantId,
			document_record_id: documentId,
			token: verificationToken,
			expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
			status: 'active',
			created_at: now(),
			updated_at: now(),
		});

		db.api_logs.push({
			id: generateId('apilog'),
			tenant_id: tenantId,
			api_client_id: auth.client.id,
			path: req.url,
			method: req.method,
			status: 201,
			request_body: payload,
			response_body: { documentId, verificationToken, qrToken },
			created_at: now(),
		});

		return new Response(
			JSON.stringify({
				documentId,
				status: 'valid',
				anchorStatus: 'pending',
				verificationToken,
				qrToken,
				qrUrl: `/api/issuers/${tenantId}/qr?token=${qrToken}`,
			}),
			{ status: 201 },
		);
	});
}
