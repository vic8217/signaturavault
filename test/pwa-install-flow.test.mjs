import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('install prompt is captured before hydration and remains usable after install', async () => {
	const [layoutSource, promptSource] = await Promise.all([
		readFile(new URL('../src/app/layout.js', import.meta.url), 'utf8'),
		readFile(
			new URL('../src/components/PwaInstallPrompt.js', import.meta.url),
			'utf8',
		),
	]);

	assert.match(layoutSource, /strategy="beforeInteractive"/);
	assert.match(layoutSource, /__signaturaPwaInstallPrompt/);
	assert.match(layoutSource, /signatura:pwa-install-ready/);
	assert.match(promptSource, /handleCapturedInstallPrompt/);
	assert.match(promptSource, /Installation complete/);
	assert.doesNotMatch(
		promptSource,
		/function handleAppInstalled\(\) \{\s*window\.location/,
	);
});

test('homepage shows mobile install alert and installed app starts at login', async () => {
	const [homeSource, alertSource, manifestSource] = await Promise.all([
		readFile(new URL('../src/app/page.js', import.meta.url), 'utf8'),
		readFile(
			new URL('../src/components/HomePwaInstallAlert.js', import.meta.url),
			'utf8',
		),
		readFile(new URL('../public/manifest.json', import.meta.url), 'utf8'),
	]);
	const manifest = JSON.parse(manifestSource);

	assert.match(homeSource, /HomePwaInstallAlert/);
	assert.match(alertSource, /max-width: 767px/);
	assert.match(alertSource, /display-mode: standalone/);
	assert.match(alertSource, /beforeinstallprompt/);
	assert.match(alertSource, /Home-screen launches open directly to/);
	assert.equal(manifest.start_url, '/login');
	assert.equal(manifest.display, 'standalone');
});

test('QR login app gate preserves challenge and falls back to logged-out scanner', async () => {
	const [pageSource, gateSource] = await Promise.all([
		readFile(new URL('../src/app/app/qr-login/page.js', import.meta.url), 'utf8'),
		readFile(new URL('../src/components/PwaQrLoginGate.js', import.meta.url), 'utf8'),
	]);

	assert.match(pageSource, /buildRemoteApprovePath/);
	assert.match(pageSource, /scannerPath = '\/login\/remote-approve\/scan'/);
	assert.match(pageSource, /challengeId && shortCode/);
	assert.match(gateSource, /display-mode: standalone/);
	assert.match(gateSource, /beforeinstallprompt/);
	assert.match(gateSource, /window\.location\.replace\(targetPath\)/);
	assert.match(gateSource, /The QR can be read by any camera/);
});
