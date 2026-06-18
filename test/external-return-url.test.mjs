import assert from 'node:assert/strict';
import test from 'node:test';

import {
	externalReturnUrlFromParams,
	isPhoneUnreachableAccuraReturnUrl,
	normalizeExternalReturnUrl,
} from '@/lib/externalReturnUrl.js';
import { buildExternalLoginReturnUrl } from '@/lib/externalLoginReturn.js';

test('phone-unreachable ACCURA return URLs include localhost and private LAN hosts', () => {
	assert.equal(
		isPhoneUnreachableAccuraReturnUrl(
			'http://192.168.68.139:3001/api/company-registration/signatura-callback?requestId=abc',
		),
		true,
	);
	assert.equal(
		isPhoneUnreachableAccuraReturnUrl(
			'http://localhost:3001/api/company-registration/signatura-callback?requestId=abc',
		),
		true,
	);
	assert.equal(
		isPhoneUnreachableAccuraReturnUrl(
			'https://accura.example/api/company-registration/signatura-callback?requestId=abc',
		),
		false,
	);
});

test('external return URL accepts local partner app callback in development', () => {
	const url = 'http://localhost:3001/register/continue?state=abc';
	assert.equal(normalizeExternalReturnUrl(url), url);
	assert.equal(
		externalReturnUrlFromParams({ next: url }),
		url,
	);
});

test('external return URL accepts any localhost partner port in development', () => {
	const url = 'http://localhost:5173/accura/register?state=abc';
	assert.equal(normalizeExternalReturnUrl(url), url);
});

test('external return URL accepts private LAN ACCURA origin in development', () => {
	const url =
		'http://192.168.68.139:3001/company-admin/login?companyCode=BEEP-7B946B&authMode=login';
	assert.equal(normalizeExternalReturnUrl(url), url);
});

test('external return URL accepts common callback parameter aliases', () => {
	const url = 'http://localhost:3002/register/accura';
	assert.equal(
		externalReturnUrlFromParams({ callbackUrl: url }),
		url,
	);
	assert.equal(
		externalReturnUrlFromParams({ app_return_url: url }),
		url,
	);
	assert.equal(
		externalReturnUrlFromParams({ from: url }),
		url,
	);
});

test('external return URL rejects unconfigured origins', () => {
	assert.equal(
		normalizeExternalReturnUrl('https://evil.example/register/continue'),
		'',
	);
});

test('external return URL can be allowlisted by exact configured callback', () => {
	const previous = process.env.SIGNATURA_ALLOWED_RETURN_URLS;
	process.env.SIGNATURA_ALLOWED_RETURN_URLS =
		'https://accura.example/auth/signatura/callback';

	try {
		assert.equal(
			normalizeExternalReturnUrl('https://accura.example/auth/signatura/callback'),
			'https://accura.example/auth/signatura/callback',
		);
	} finally {
		if (previous === undefined) {
			delete process.env.SIGNATURA_ALLOWED_RETURN_URLS;
		} else {
			process.env.SIGNATURA_ALLOWED_RETURN_URLS = previous;
		}
	}
});

test('external login return URL carries Signatura assertion and state', () => {
	const url = buildExternalLoginReturnUrl('http://localhost:3001/admin/login', {
		signaturaId: 'SIG-ACCURA-SADM-FB281C-6736',
		challengeId: 'assertion-123',
		state: 'state-abc',
	});
	const parsed = new URL(url);

	assert.equal(parsed.origin, 'http://localhost:3001');
	assert.equal(parsed.pathname, '/admin/login');
	assert.equal(
		parsed.searchParams.get('signaturaId'),
		'SIG-ACCURA-SADM-FB281C-6736',
	);
	assert.equal(parsed.searchParams.get('signaturaAssertion'), 'assertion-123');
	assert.equal(parsed.searchParams.get('state'), 'state-abc');
});
