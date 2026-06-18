import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('first login no-device state shows trusted device registration action', async () => {
	const source = await readFile(
		new URL('../src/components/LoginTrustedDeviceQrPanel.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /NO_TRUSTED_DEVICE_MESSAGE/);
	assert.match(source, /error === NO_TRUSTED_DEVICE_MESSAGE/);
	assert.match(source, /Register trusted device/);
	assert.match(source, /href=\{registerDeviceHref\}/);
	assert.match(source, /enrolled trusted device/);
	assert.match(
		source,
		/const normalizedSignaturaId = String\(signaturaId \|\| ''\)\.trim\(\)\.toUpperCase\(\)/,
	);
	assert.doesNotMatch(source, /signaturaId\.trim\(\)/);
});

test('login prefers this device passkey before QR fallback', async () => {
	const source = await readFile(
		new URL('../src/components/LoginPasskeyForm.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /setStep\('methods'\)/);
	assert.match(source, /Sign in with this device passkey/);
	assert.match(source, /Use another trusted device \(QR\)/);
	assert.match(source, /signaturaApiRequest/);
	assert.match(source, /Passkey login start/);
	assert.match(source, /Passkey login finish/);
	assert.match(source, /typeof signaturaIdOverride === 'string'/);
	assert.match(source, /normalizedOverride \|\| normalizedSignaturaId/);
	assert.match(source, /onClick=\{\(\) => startLocalPasskeyLogin\(\)\}/);
	assert.doesNotMatch(source, /onClick=\{startLocalPasskeyLogin\}/);
	assert.doesNotMatch(source, /Sign in with passkey on this device \(secondary\)/);
});
