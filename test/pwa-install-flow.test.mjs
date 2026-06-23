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
