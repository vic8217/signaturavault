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
});

test('login prefers this device passkey before QR fallback', async () => {
	const source = await readFile(
		new URL('../src/components/LoginPasskeyForm.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /setStep\('methods'\)/);
	assert.match(source, /Sign in with this device passkey/);
	assert.match(source, /Use another trusted device \(QR\)/);
	assert.doesNotMatch(source, /Sign in with passkey on this device \(secondary\)/);
});
