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

test('trusted device login client stores signatura id per origin for auto-login', async () => {
	const source = await readFile(
		new URL('../src/lib/trustedDeviceLoginClient.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /TRUSTED_DEVICE_LOGIN_STORAGE_KEY/);
	assert.match(source, /isStandalonePwa/);
	assert.match(source, /storeTrustedDeviceSignaturaId/);
	assert.match(source, /readStoredTrustedDeviceSignaturaId/);
	assert.match(source, /clearStoredTrustedDeviceSignaturaId/);
	assert.match(source, /shouldAutoPasskeyLoginOnOpen/);
	assert.match(source, /parsed\.origin !== resolvedOrigin/);
});

test('trusted device auto-login is allowed for owner login without requiring pwa mode', async () => {
	const { shouldAutoPasskeyLoginOnOpen } = await import(
		'../src/lib/trustedDeviceLoginClient.js'
	);

	assert.equal(shouldAutoPasskeyLoginOnOpen(), true);
	assert.equal(
		shouldAutoPasskeyLoginOnOpen({ loginAccountType: 'issuer' }),
		false,
	);
	assert.equal(
		shouldAutoPasskeyLoginOnOpen({ externalReturnUrl: 'https://accura.test' }),
		false,
	);
});

test('login form auto-starts passkey when a stored id exists', async () => {
	const source = await readFile(
		new URL('../src/components/LoginPasskeyForm.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /shouldAutoPasskeyLoginOnOpen/);
	assert.match(source, /readStoredTrustedDeviceSignaturaId/);
	assert.match(source, /startLocalPasskeyLogin\(resolvedSignaturaId\)/);
	assert.match(source, /storeTrustedDeviceSignaturaId\(activeSignaturaId\)/);
	assert.match(source, /Opening biometric sign-in/);
	assert.match(source, /switchAccount/);
	assert.match(source, /requiredRolePrefix/);
});
