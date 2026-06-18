import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('PWA QR scanner uses a software decoder instead of BarcodeDetector only', async () => {
	const source = await readFile(
		new URL('../src/components/QrCodeScanner.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /import\(\s*'html5-qrcode'\s*\)/);
	assert.match(source, /Html5QrcodeSupportedFormats\.QR_CODE/);
	assert.match(source, /facingMode: 'environment'/);
	assert.match(source, /navigator\.mediaDevices\?\.getUserMedia/);
	assert.doesNotMatch(source, /new window\.BarcodeDetector/);
});
