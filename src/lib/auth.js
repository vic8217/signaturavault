import crypto from 'crypto';
import { loadDb, now } from './db';

const API_KEY_HEADER = 'x-api-key';
const AUTHORIZATION_HEADER = 'authorization';
const WEBHOOK_SIGNATURE_HEADER = 'x-signature';

function hashValue(value) {
	return crypto.createHash('sha256').update(value).digest('hex');
}

function constantTimeCompare(a, b) {
	const bufferA = Buffer.from(a || '', 'utf8');
	const bufferB = Buffer.from(b || '', 'utf8');
	return (
		bufferA.length === bufferB.length &&
		crypto.timingSafeEqual(bufferA, bufferB)
	);
}

async function getApiKeyFromRequest(req) {
	const headers = Object.fromEntries(req.headers.entries());
	return (
		headers[API_KEY_HEADER] ||
		headers[AUTHORIZATION_HEADER]?.replace(/^Bearer\s+/i, '') ||
		null
	);
}

async function authenticateApiRequest(req, tenantId) {
	const db = await loadDb();
	const apiKeyValue = await getApiKeyFromRequest(req);
	if (!apiKeyValue) return null;

	const apiKeyHash = hashValue(apiKeyValue);
	const keyRecord = db.issuer_api_keys.find(
		(key) =>
			key.tenant_id === tenantId &&
			((key.key_hash && constantTimeCompare(key.key_hash, apiKeyHash)) ||
				(key.key && constantTimeCompare(key.key, apiKeyValue))),
	);
	if (!keyRecord) return null;

	const client = db.issuer_api_clients.find(
		(clientItem) => clientItem.id === keyRecord.api_client_id,
	);
	if (!client || client.tenant_id !== tenantId) return null;

	return {
		client,
		key: keyRecord,
	};
}

function verifyWebhookSignature(req, payload, secret) {
	if (!secret) return false;
	const headers = Object.fromEntries(req.headers.entries());
	const signature = headers[WEBHOOK_SIGNATURE_HEADER];
	if (!signature) return false;

	const expected = crypto
		.createHmac('sha256', secret)
		.update(payload || '')
		.digest('hex');

	return constantTimeCompare(signature, expected);
}

export {
	hashValue,
	constantTimeCompare,
	getApiKeyFromRequest,
	authenticateApiRequest,
	verifyWebhookSignature,
};
