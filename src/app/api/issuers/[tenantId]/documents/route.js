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
	const { templateId, documentHash } = payload;

	if (!documentHash) {
		return new Response(
			JSON.stringify({
				error: 'documentHash is required',
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
				external_id: documentId,
				recipient_name: '[hidden]',
				issued_at: timestamp,
				hash: documentHash,
				document_hash: documentHash,
			status: 'valid',
			anchor_status: 'pending',
				anchor_batch_id: null,
				verification_token: verificationToken,
				qr_token: qrToken,
				metadata: null,
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

		db.api_logs.push(
			safeApiLogEntry({
				id: generateId('apilog'),
				tenantId,
				apiClientId: auth.client.id,
				req,
				status: 201,
					requestBody: {
						action: 'document_created',
						documentId,
						templateId: templateId || null,
						privateFieldsStoredAsPlaintext: false,
					},
				responseBody: { documentId, status: 'valid', anchorStatus: 'pending' },
				createdAt: now(),
			}),
		);

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
