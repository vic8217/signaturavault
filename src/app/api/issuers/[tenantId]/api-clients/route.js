import { authenticateApiRequest } from '@/lib/auth';
import { withDb, generateId, now } from '@/lib/db';

export async function GET(req, { params }) {
	const { tenantId } = params;
	const auth = await authenticateApiRequest(req, tenantId);
	if (!auth) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
		});
	}

	return withDb(async (db) => {
		const clients = db.issuer_api_clients.filter(
			(client) => client.tenant_id === tenantId,
		);
		return new Response(JSON.stringify({ clients }), { status: 200 });
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

	const body = await req.json();
	const { name, scopes } = body;
	if (!name) {
		return new Response(JSON.stringify({ error: 'name is required' }), {
			status: 400,
		});
	}

	return withDb(async (db) => {
		const apiClientId = generateId('client');
		const apiKeyId = generateId('apikey');
		const apiKey = generateId('key');
		const clientSecret = generateId('secret');

		db.issuer_api_clients.push({
			id: apiClientId,
			tenant_id: tenantId,
			name,
			client_id: generateId('cid'),
			client_secret: clientSecret,
			scopes: scopes || [
				'document:read',
				'document:write',
				'verification:read',
			],
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

		return new Response(
			JSON.stringify({
				client: {
					id: apiClientId,
					name,
					clientSecret,
					apiKey,
				},
			}),
			{ status: 201 },
		);
	});
}
