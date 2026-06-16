import assert from 'node:assert/strict';
import test from 'node:test';
import {
	readRegistrationApiJson,
	registrationApiFetch,
} from '../src/lib/registration-api-client.js';

test('readRegistrationApiJson rejects HTML responses with a clear error', async () => {
	const response = new Response('<!DOCTYPE html><html></html>', {
		status: 200,
		headers: { 'content-type': 'text/html; charset=utf-8' },
	});

	await assert.rejects(
		() => readRegistrationApiJson(response, 'Passkey setup'),
		/non-JSON response/,
	);
});

test('registrationApiFetch includes ngrok bypass header', async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (_url, options = {}) => {
		assert.equal(options.headers['ngrok-skip-browser-warning'], '1');
		return new Response(JSON.stringify({ ok: true }), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		});
	};

	try {
		await registrationApiFetch('/api/auth/register/start', { method: 'POST' });
	} finally {
		globalThis.fetch = originalFetch;
	}
});
