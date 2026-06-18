import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('login page restores an existing session before rendering the form', async () => {
	const source = await readFile(
		new URL('../src/app/login/page.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /requireSession/);
	assert.match(source, /redirect\(nextPath\)/);
	assert.match(source, /!externalReturnUrl/);
});

test('trusted device login client stores signatura id per origin for pwa auto-login', async () => {
	const source = await readFile(
		new URL('../src/lib/trustedDeviceLoginClient.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /TRUSTED_DEVICE_LOGIN_STORAGE_KEY/);
	assert.match(source, /isStandalonePwa/);
	assert.match(source, /storeTrustedDeviceSignaturaId/);
	assert.match(source, /readStoredTrustedDeviceSignaturaId/);
	assert.match(source, /shouldAutoPasskeyLoginOnOpen/);
	assert.match(source, /parsed\.origin !== resolvedOrigin/);
});

test('login form auto-starts passkey in installed pwa when a stored id exists', async () => {
	const source = await readFile(
		new URL('../src/components/LoginPasskeyForm.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /shouldAutoPasskeyLoginOnOpen/);
	assert.match(source, /readStoredTrustedDeviceSignaturaId/);
	assert.match(source, /startLocalPasskeyLogin\(resolvedSignaturaId\)/);
	assert.match(source, /storeTrustedDeviceSignaturaId\(activeSignaturaId\)/);
	assert.match(source, /Opening your trusted device passkey/);
});
