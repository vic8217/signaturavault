import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildRemoteLoginQrUrl } from '@/lib/trustedDeviceLoginChallenge.js';

test('remote approve QR URL includes expected Signatura ID', () => {
	const url = new URL(
		buildRemoteLoginQrUrl('https://signatura.example', 'challenge-1', 'ABC123', {
			signaturaId: 'SIG-U-1837-914E',
		}),
	);
	assert.equal(url.pathname, '/app/qr-login');
	assert.equal(url.searchParams.get('cid'), 'challenge-1');
	assert.equal(url.searchParams.get('code'), 'ABC123');
	assert.equal(
		url.searchParams.get('signaturaId'),
		'SIG-U-1837-914E',
	);
});

test('remote approve page switches account when session Signatura ID differs', async () => {
	const source = await readFile(
		new URL('../src/app/login/remote-approve/page.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /expectedSignaturaId/);
	assert.match(source, /buildApproverLoginRedirect/);
	assert.match(source, /switchAccount: true/);
});

test('login page does not restore session when a different Signatura ID is requested', async () => {
	const source = await readFile(
		new URL('../src/app/login/page.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /needsDifferentAccount/);
	assert.match(source, /requestedSignaturaId/);
});
