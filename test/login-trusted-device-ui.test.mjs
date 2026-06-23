import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('login no longer auto-redirects to device registration on missing passkey', async () => {
	const source = await readFile(
		new URL('../src/components/LoginPasskeyForm.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /setCanRegisterDevice\(true\)/);
	assert.match(source, /Register this phone, or create a new account/);
	assert.doesNotMatch(source, /Opening device registration/);
	assert.doesNotMatch(source, /window\.location\.href = registerHref/);
});

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

test('login offers direct biometric sign-in before QR fallback', async () => {
	const source = await readFile(
		new URL('../src/components/LoginPasskeyForm.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /setStep\('methods'\)/);
	assert.match(source, /Sign in with biometrics/);
	assert.match(source, /fingerprint, face, or device screen lock/);
	assert.match(source, /onClick=\{\(\) => startLocalPasskeyLogin\(\)\}/);
	assert.match(source, /Your biometric stays on your device/);
	assert.match(source, /Use another trusted device \(QR\)/);
	assert.match(source, /signaturaApiRequest/);
	assert.match(source, /Passkey login start/);
	assert.match(source, /Passkey login finish/);
	assert.match(source, /typeof signaturaIdOverride === 'string'/);
	assert.match(source, /signaturaIdInputRef/);
	assert.match(source, /signaturaIdInputRef\.current\?\.value/);
	assert.match(source, /disabled=\{isSubmitting\}/);
	assert.doesNotMatch(source, /onClick=\{startLocalPasskeyLogin\}/);
	assert.doesNotMatch(source, /Sign in with passkey on this device \(secondary\)/);
});
