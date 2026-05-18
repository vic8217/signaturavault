import { authenticateApiRequest, hashValue } from '@/lib/auth';
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
		const webhooks = db.webhooks.filter((hook) => hook.tenant_id === tenantId);
		return new Response(JSON.stringify({ webhooks }), { status: 200 });
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

	const payload = await req.json();
	const { targetUrl, events } = payload;
	if (!targetUrl) {
		return new Response(JSON.stringify({ error: 'targetUrl is required' }), {
			status: 400,
		});
	}

	return withDb(async (db) => {
		const webhookId = generateId('webhook');
		const secret = hashValue(generateId('whsec'));

		db.webhooks.push({
			id: webhookId,
			tenant_id: tenantId,
			target_url: targetUrl,
			events: events || [
				'issuance',
				'verification',
				'revocation',
				'validation_failed',
			],
			secret,
			status: 'active',
			created_at: now(),
			updated_at: now(),
		});

		return new Response(
			JSON.stringify({
				webhookId,
				targetUrl,
				events: events || [
					'issuance',
					'verification',
					'revocation',
					'validation_failed',
				],
				secret,
			}),
			{ status: 201 },
		);
	});
}
