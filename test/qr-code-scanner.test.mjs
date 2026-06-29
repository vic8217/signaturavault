import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('PWA QR scanner prefers native BarcodeDetector and scans the viewfinder region', async () => {
	const source = await readFile(
		new URL('../src/components/QrCodeScanner.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /qrDecoderModulePromise \|\|= import\('html5-qrcode'\)/);
	assert.match(source, /void loadQrDecoder\(\)/);
	assert.match(source, /Html5QrcodeSupportedFormats\.QR_CODE/);
	assert.match(source, /facingMode: 'environment'/);
	assert.match(source, /videoConstraints/);
	assert.match(source, /\[&_video\]:!absolute/);
	assert.match(source, /qrbox: scanRegionQrbox/);
	assert.match(source, /fps: 20/);
	assert.match(source, /disableFlip: true/);
	assert.match(source, /navigator\.mediaDevices\?\.getUserMedia/);
	assert.match(source, /requestCameraAccess/);
	assert.match(source, /readCameraPermissionState/);
	assert.match(source, /requiresCameraGesture/);
	assert.match(source, /Enable camera to scan QR codes/);
	assert.match(source, /onClick={enableCamera}/);
	assert.match(
		source,
		/setCameraState\('prompt'\)/,
	);
	assert.doesNotMatch(
		source,
		/processingRef\.current = false;\s*const startFrame = window\.requestAnimationFrame\(\(\) => void startCamera\(\)\)/,
	);
	assert.match(source, /waitForScannerContainer/);
	assert.match(source, /ensureScannerVideoPreview/);
	assert.match(source, /canUseNativeBarcodeDetector/);
	assert.match(source, /removeHtml5QrShading/);
	assert.match(source, /useBarCodeDetectorIfSupported: canUseNativeBarcodeDetector\(\)/);
	assert.match(source, /shouldAutoContinueScan/);
	assert.match(source, /parseSignaturaAppApprovalQr/);
	assert.match(source, /kind: 'app-approval'/);
	assert.match(source, /Approve \$\{appApprovalQr\.app\} access/);
	assert.match(source, /Promise\.all\(\[[\s\S]*loadQrDecoder/);
	assert.doesNotMatch(source, /setTimeout\(\(\) => void startCamera\(\), 80\)/);
	assert.match(source, /scanFile\(file, false\)/);
	assert.match(source, /getRunningTrackCameraCapabilities/);
	assert.match(source, /QR Detected/);
	assert.match(source, /Verifying request…/);
	assert.match(source, /Approve Unlock/);
	assert.match(source, /router\.push\(result\.href\)/);
	assert.doesNotMatch(source, /\/api\/hoa-key\/remote-unlock\/approve/);
	assert.match(source, /Paste QR Link/);
	assert.match(source, /No QR code found in this image/);
	assert.match(source, /processingRef\.current/);
	assert.match(source, /void stopCamera\(\)/);
	assert.doesNotMatch(source, /Start QR scanner/);
	assert.doesNotMatch(source, /Stop camera/);
	assert.doesNotMatch(source, /new window\.BarcodeDetector/);
});
