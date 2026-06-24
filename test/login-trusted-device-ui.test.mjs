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

test('trusted-device QR opens Signatura PWA gate before approval', async () => {
	const [challengeSource, scannerSource, gatePageSource, gateSource, panelSource] =
		await Promise.all([
			readFile(
				new URL('../src/lib/trustedDeviceLoginChallenge.js', import.meta.url),
				'utf8',
			),
			readFile(new URL('../src/components/QrCodeScanner.js', import.meta.url), 'utf8'),
			readFile(new URL('../src/app/app/qr-login/page.js', import.meta.url), 'utf8'),
			readFile(new URL('../src/components/PwaQrLoginGate.js', import.meta.url), 'utf8'),
			readFile(
				new URL('../src/components/LoginTrustedDeviceQrPanel.js', import.meta.url),
				'utf8',
			),
		]);

	assert.match(challengeSource, /new URL\('\/app\/qr-login', origin\)/);
	assert.match(scannerSource, /url\.pathname\.includes\('\/app\/qr-login'\)/);
	assert.match(gatePageSource, /PwaQrLoginGate/);
	assert.match(gatePageSource, /buildRemoteApprovePath/);
	assert.match(gateSource, /window\.location\.replace\(targetPath\)/);
	assert.match(gateSource, /Install Signatura/);
	assert.match(gateSource, /Open Scanner/);
	assert.match(panelSource, /It opens Signatura first/);
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

test('admin login requires local passkey and does not offer QR fallback', async () => {
	const loginForm = await readFile(
		new URL('../src/components/LoginPasskeyForm.js', import.meta.url),
		'utf8',
	);
	const startRoute = await readFile(
		new URL('../src/app/api/auth/login/start/route.ts', import.meta.url),
		'utf8',
	);
	const finishRoute = await readFile(
		new URL('../src/app/api/auth/login/finish/route.ts', import.meta.url),
		'utf8',
	);
	const registerFinishRoute = await readFile(
		new URL('../src/app/api/auth/register/finish/route.ts', import.meta.url),
		'utf8',
	);

	assert.match(loginForm, /const requiresLocalPasskey = loginAccountType === 'admin'/);
	assert.match(loginForm, /next: nextPath/);
	assert.match(loginForm, /!requiresLocalPasskey/);
	assert.match(startRoute, /requireLocalPlatformCredential = isAdminPath\(nextPath\)/);
	assert.match(startRoute, /transports\.includes\('internal'\)/);
	assert.match(startRoute, /!transports\.includes\('hybrid'\)/);
	assert.match(startRoute, /Cross-device phone QR passkeys are not allowed for admin access/);
	assert.match(finishRoute, /isAdminPath\(allowedNext\) &&/);
	assert.match(finishRoute, /!isLocalPlatformCredential\(credential\)/);
	assert.match(finishRoute, /isPlatformAssertion\(response\)/);
	assert.match(finishRoute, /Cross-device phone QR passkeys are not allowed for admin access/);
	assert.match(registerFinishRoute, /isAdminLocalPlatformRegistration/);
	assert.match(registerFinishRoute, /authenticatorAttachment === 'platform'/);
	assert.match(registerFinishRoute, /credentialDeviceType === 'singleDevice'/);
	assert.match(registerFinishRoute, /credentialBackedUp === false/);
	assert.match(registerFinishRoute, /Phone QR, synced, or backed-up passkeys are not allowed/);
});
