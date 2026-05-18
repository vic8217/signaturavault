import { withDb, generateId, now } from '@/lib/db';

export async function POST(req) {
	const payload = await req.json();
	const { issuerName, tenantName, contactEmail } = payload;

	if (!issuerName || !tenantName || !contactEmail) {
		return new Response(
			JSON.stringify({
				error: 'tenantName, issuerName, and contactEmail are required',
			}),
			{ status: 400 },
		);
	}

	return withDb(async (db) => {
		const tenantId = generateId('tenant');
		const issuerId = generateId('issuer');
		const apiClientId = generateId('client');
		const apiKeyId = generateId('apikey');
		const apiKey = generateId('key');
		const clientSecret = generateId('secret');

		db.tenants.push({
			id: tenantId,
			name: tenantName,
			external_reference: null,
			created_at: now(),
			updated_at: now(),
		});

		db.issuers.push({
			id: issuerId,
			tenant_id: tenantId,
			name: issuerName,
			contact_email: contactEmail,
			status: 'active',
			created_at: now(),
			updated_at: now(),
		});

		db.issuer_api_clients.push({
			id: apiClientId,
			tenant_id: tenantId,
			name: `${issuerName} default client`,
			client_id: generateId('cid'),
			client_secret: clientSecret,
			scopes: ['document:read', 'document:write', 'verification:read'],
			created_at: now(),
			updated_at: now(),
		});

		db.issuer_api_keys.push({
			id: apiKeyId,
			tenant_id: tenantId,
			api_client_id: apiClientId,
			key: apiKey,
			status: 'active',
			created_at: now(),
			updated_at: now(),
		});

		db.audit_logs.push({
			id: generateId('audit'),
			tenant_id: tenantId,
			issuer_id: issuerId,
			user_id: null,
			action: 'issuer_registered',
			target: issuerId,
			details: { issuerName, contactEmail },
			created_at: now(),
		});

		return new Response(
			JSON.stringify({
				tenantId,
				issuerId,
				apiClient: {
					clientId: apiClientId,
					clientSecret,
					apiKey,
				},
			}),
			{ status: 201 },
		);
	});
}
