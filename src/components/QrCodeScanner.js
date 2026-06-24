'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
	ArrowLeft,
	Camera,
	CameraOff,
	Check,
	FileImage,
	Flashlight,
	FlashlightOff,
	Link2,
	LoaderCircle,
	ShieldCheck,
} from 'lucide-react';
import {
	buildAccuraQrApprovalPath,
	parseAccuraLoginQr,
	parseAccuraRegistrationQr,
} from '@/lib/accuraQrPayload';
import { extractTokenFromInput } from '@/lib/verify-token';

let qrDecoderModulePromise;

function loadQrDecoder() {
	qrDecoderModulePromise ||= import('html5-qrcode');
	return qrDecoderModulePromise;
}

// Begin downloading the decoder as soon as the scanner bundle is evaluated.
if (typeof window !== 'undefined') {
	void loadQrDecoder();
}

function buildChallengeHref(pathname, challengeId, shortCode, signaturaId = '') {
	const params = new URLSearchParams();
	params.set('cid', String(challengeId || ''));
	params.set('code', String(shortCode).trim().toUpperCase());
	const normalizedSignaturaId = String(signaturaId || '').trim().toUpperCase();
	if (normalizedSignaturaId) params.set('signaturaId', normalizedSignaturaId);
	return `${pathname}?${params.toString()}`;
}

function prefersSoftwareQrDecoder() {
	if (typeof window === 'undefined') return false;
	return (
		/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
		window.matchMedia('(display-mode: standalone)').matches
	);
}

function canUseNativeBarcodeDetector() {
	if (typeof window === 'undefined') return false;
	return 'BarcodeDetector' in window;
}

function scanRegionQrbox(viewfinderWidth, viewfinderHeight) {
	const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72);
	return { width: size, height: size };
}

function requiresCameraGesture() {
	return prefersSoftwareQrDecoder();
}

async function readCameraPermissionState() {
	if (!navigator.permissions?.query) return 'unknown';
	try {
		const status = await navigator.permissions.query({ name: 'camera' });
		return status.state;
	} catch {
		return 'unknown';
	}
}

async function requestCameraAccess() {
	const stream = await navigator.mediaDevices.getUserMedia({
		audio: false,
		video: {
			facingMode: { ideal: 'environment' },
			width: { ideal: 1280 },
			height: { ideal: 720 },
		},
	});
	for (const track of stream.getTracks()) {
		track.stop();
	}
}

function waitForScannerContainer(elementId, timeoutMs = 5000) {
	return new Promise((resolve, reject) => {
		const element = document.getElementById(elementId);
		if (!element) {
			reject(new Error('Scanner container is missing'));
			return;
		}
		const isReady = () =>
			element.clientWidth >= 120 && element.clientHeight >= 120;
		if (isReady()) {
			resolve(element);
			return;
		}
		let timeoutId;
		const observer = new ResizeObserver(() => {
			if (isReady()) {
				window.clearTimeout(timeoutId);
				observer.disconnect();
				resolve(element);
			}
		});
		observer.observe(element);
		timeoutId = window.setTimeout(() => {
			observer.disconnect();
			reject(new Error('Scanner preview did not layout in time.'));
		}, timeoutMs);
	});
}

function removeHtml5QrShading(elementId) {
	document.getElementById(elementId)?.querySelector('#qr-shaded-region')?.remove();
}

async function ensureScannerVideoPreview(elementId) {
	for (let attempt = 0; attempt < 24; attempt += 1) {
		const video = document.getElementById(elementId)?.querySelector('video');
		if (video) {
			video.setAttribute('playsinline', 'true');
			video.setAttribute('webkit-playsinline', 'true');
			video.style.position = 'absolute';
			video.style.inset = '0';
			video.style.width = '100%';
			video.style.height = '100%';
			video.style.maxWidth = 'none';
			video.style.objectFit = 'cover';
			video.style.zIndex = '0';
			if (video.videoWidth > 0 && !video.paused) return true;
			await video.play().catch(() => null);
			if (video.videoWidth > 0) return true;
		}
		await new Promise((resolve) => window.setTimeout(resolve, 30));
	}
	return false;
}

function shouldAutoContinueScan(classified) {
	if (!classified || classified.kind === 'invalid') return false;
	if (classified.kind === 'accura' || classified.kind === 'accura-registration') return true;
	if (classified.kind === 'remote-unlock' && !classified.requiresLookup) return true;
	return false;
}

function classifyPayload(payload, accuraLoginOnly = false) {
	const raw = String(payload || '').trim();
	const accuraQr = parseAccuraLoginQr(raw);
	if (accuraQr.valid) {
		return {
			kind: 'accura',
			label: 'ACCURA Login Request',
			payload: raw,
			href: buildAccuraQrApprovalPath(accuraQr),
			details: {
				Purpose: 'Approve sign-in to ACCURA',
				'Request source': 'ACCURA',
			},
		};
	}
	const registrationQr = parseAccuraRegistrationQr(raw);
	if (registrationQr.valid) {
		if (accuraLoginOnly) {
			return {
				kind: 'invalid',
				label: 'ACCURA Registration QR',
				payload: raw,
				error:
					'This QR starts ACCURA registration, not login. Use your phone Camera app, paste the link in Safari, or tap Continue on this device in ACCURA.',
			};
		}
		return {
			kind: 'accura-registration',
			label: 'ACCURA Registration',
			payload: raw,
			href: registrationQr.href,
			details: {
				Purpose: 'Register ACCURA company admin identity',
				'Request source': 'ACCURA',
			},
		};
	}
	if (accuraLoginOnly) {
		return { kind: 'invalid', label: 'Unsupported QR', payload: raw, error: accuraQr.error };
	}

	try {
		const parsed = JSON.parse(raw);
		const challengeId = parsed.cid || parsed.challengeId || parsed.id;
		const shortCode = parsed.code || parsed.shortCode;
		if (challengeId && shortCode) {
			return {
				kind: 'remote-unlock',
				label: 'Remote Unlock Request',
				payload: raw,
				href: buildChallengeHref('/hoa-key/remote-unlock', challengeId, shortCode),
				challengeId,
				shortCode,
				requiresLookup: true,
				details: {
					Purpose: 'Authorize a remote unlock request',
					'Request source': parsed.source || parsed.app || 'HavenxSig',
				},
			};
		}
	} catch {
		// Continue with URL and token parsing.
	}

	try {
		const url = new URL(raw, window.location.origin);
		const challengeId =
			url.searchParams.get('cid') ||
			url.searchParams.get('challengeId') ||
			url.searchParams.get('id');
		const shortCode =
			url.searchParams.get('code') || url.searchParams.get('shortCode');
		const signaturaId =
			url.searchParams.get('signaturaId') ||
			url.searchParams.get('signatura_id') ||
			'';
		if (challengeId && shortCode) {
			const isLoginApproval =
				url.pathname.includes('/login/remote-approve') ||
				url.pathname.includes('/app/qr-login');
			return {
				kind: 'remote-unlock',
				label: 'Remote Unlock Request',
				payload: raw,
				href: buildChallengeHref(
					isLoginApproval
						? '/login/remote-approve'
						: '/hoa-key/remote-unlock',
					challengeId,
					shortCode,
					signaturaId,
				),
				challengeId,
				shortCode,
				requiresLookup: !isLoginApproval,
				details: {
					Purpose: isLoginApproval
						? 'Approve a trusted-device login'
						: 'Authorize a remote unlock request',
					'Request source': isLoginApproval ? 'Signatura browser' : 'HavenxSig',
				},
			};
		}
	} catch {
		// Plain verification tokens are handled below.
	}

	const token = extractTokenFromInput(raw);
	if (
		token &&
		(/^(QR|VER)[-_A-Z0-9]{8,}$/i.test(token) ||
			/\/(?:api\/)?verify(?:\/|\?)/i.test(raw))
	) {
		return {
			kind: 'document',
			label: 'Document Verification',
			payload: raw,
			token,
			href: `/verify?token=${encodeURIComponent(token)}`,
			details: { Purpose: 'Verify a Signatura-issued document' },
		};
	}

	return {
		kind: 'invalid',
		label: 'Unknown QR',
		payload: raw,
		error: accuraQr.reason === 'sensitive_payload'
			? 'This QR contains unsupported sensitive data.'
			: 'This is not a supported Signatura QR code.',
	};
}

function friendlyError(message = '') {
	const value = String(message);
	if (/expired/i.test(value)) return 'This QR request has expired. Ask for a new QR code.';
	if (/already.*used|already.*approved|consumed/i.test(value)) {
		return 'This QR request has already been used.';
	}
	if (/not found|invalid token/i.test(value)) return 'This QR link is invalid or no longer available.';
	if (/permission|notallowed/i.test(value)) {
		return 'Camera permission was denied. Allow camera access to scan QR codes.';
	}
	return value || 'Something went wrong while checking this QR code.';
}

function ScannerControl({ icon: Icon, label, active = false, disabled = false, onClick }) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={`grid min-w-20 justify-items-center gap-2 rounded-2xl border px-3 py-3 text-xs font-semibold transition ${
				active
					? 'border-red-400 bg-red-500/15 text-red-100'
					: 'border-white/10 bg-white/5 text-slate-200 hover:border-red-400/50'
			} disabled:cursor-not-allowed disabled:opacity-40`}>
			<Icon className="h-5 w-5" aria-hidden="true" />
			<span>{label}</span>
		</button>
	);
}

function QRDetectedPreview({ detected, onContinue, onScanAgain, onCancel }) {
	return (
		<section className="mx-auto grid min-h-[62vh] w-full max-w-lg content-center px-4 py-8 text-white">
			<div className="rounded-3xl border border-red-500/30 bg-[#050b16] p-6 shadow-2xl">
				<div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-red-500/15 text-red-300">
					<ShieldCheck className="h-8 w-8" />
				</div>
				<p className="mt-5 text-center text-sm font-bold uppercase tracking-[0.22em] text-red-300">
					QR Detected
				</p>
				<h2 className="mt-2 text-center text-3xl font-black">{detected.label}</h2>
				<dl className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm">
					{Object.entries(detected.details || {}).map(([label, value]) => (
						<div key={label} className="flex justify-between gap-4">
							<dt className="text-slate-400">{label}</dt>
							<dd className="text-right font-semibold text-white">{value}</dd>
						</div>
					))}
					<div className="flex justify-between gap-4">
						<dt className="text-slate-400">Timestamp</dt>
						<dd className="text-right text-white">{new Date().toLocaleString()}</dd>
					</div>
				</dl>
				{detected.error ? (
					<p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-100">
						{detected.error}
					</p>
				) : null}
				<div className="mt-6 grid gap-3">
					<button
						type="button"
						onClick={onContinue}
						disabled={detected.kind === 'invalid'}
						className="rounded-xl bg-red-500 px-5 py-4 text-sm font-bold text-white transition hover:bg-red-400 disabled:bg-slate-700">
						Continue
					</button>
					<div className="grid grid-cols-2 gap-3">
						<button
							type="button"
							onClick={onScanAgain}
							className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-white">
							Scan Again
						</button>
						<button
							type="button"
							onClick={onCancel}
							className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-slate-300">
							Cancel
						</button>
					</div>
				</div>
			</div>
		</section>
	);
}

function QRProcessingStatus({ steps, activeStep }) {
	return (
		<section className="mx-auto grid min-h-[62vh] w-full max-w-lg content-center px-5 text-white">
			<LoaderCircle className="mx-auto h-12 w-12 animate-spin text-red-400" />
			<h2 className="mt-6 text-center text-3xl font-black">Verifying request…</h2>
			<div className="mt-8 grid gap-4">
				{steps.map((step, index) => (
					<div key={step} className="flex items-center gap-3 text-sm">
						<span className={`grid h-7 w-7 place-items-center rounded-full ${
							index < activeStep
								? 'bg-emerald-500 text-white'
								: index === activeStep
									? 'bg-red-500/20 text-red-300'
									: 'bg-white/5 text-slate-600'
						}`}>
							{index < activeStep ? (
								<Check className="h-4 w-4" />
							) : index === activeStep ? (
								<LoaderCircle className="h-4 w-4 animate-spin" />
							) : (
								index + 1
							)}
						</span>
						<span className={index <= activeStep ? 'text-white' : 'text-slate-500'}>
							{step}
						</span>
					</div>
				))}
			</div>
		</section>
	);
}

function QRVerificationResult({ result, onDone, onTryAgain, onPaste, onContinueRemote }) {
	const success = result.status === 'success';
	return (
		<section className="mx-auto grid min-h-[62vh] w-full max-w-lg content-center px-4 py-8 text-white">
			<div className={`rounded-3xl border p-6 ${
				success
					? 'border-emerald-400/30 bg-emerald-500/10'
					: 'border-red-500/30 bg-red-500/10'
			}`}>
				<p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-300">
					{result.kind === 'remote-unlock' ? 'Remote unlock' : 'Verification result'}
				</p>
				<h2 className="mt-2 text-3xl font-black">
					{result.kind === 'remote-unlock' && success
						? 'Unlock request ready'
						: success
							? 'Authentic'
							: 'Could not verify'}
				</h2>
				{result.message ? <p className="mt-3 text-sm text-slate-200">{result.message}</p> : null}
				{result.details ? (
					<dl className="mt-6 grid gap-3 rounded-2xl bg-black/20 p-4 text-sm">
						{Object.entries(result.details).map(([label, value]) => (
							<div key={label} className="flex justify-between gap-4">
								<dt className="text-slate-400">{label}</dt>
								<dd className="break-all text-right font-semibold text-white">{value || '—'}</dd>
							</div>
						))}
					</dl>
				) : null}
				<div className="mt-6 grid gap-3">
					{result.kind === 'remote-unlock' && success ? (
						<>
							<button
								type="button"
								onClick={onContinueRemote}
								className="rounded-xl bg-red-500 px-5 py-4 text-sm font-bold text-white">
								Approve Unlock
							</button>
							<button
								type="button"
								onClick={onDone}
								className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold">
								Deny
							</button>
						</>
					) : success ? (
						<>
							<button
								type="button"
								onClick={result.viewHref ? () => window.location.assign(result.viewHref) : onDone}
								className="rounded-xl bg-red-500 px-5 py-4 text-sm font-bold text-white">
								View Document
							</button>
							<button
								type="button"
								onClick={onDone}
								className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold">
								Done
							</button>
						</>
					) : (
						<div className="grid grid-cols-2 gap-3">
							<button
								type="button"
								onClick={onTryAgain}
								className="rounded-xl bg-red-500 px-4 py-3 text-sm font-bold">
								Try Again
							</button>
							<button
								type="button"
								onClick={onPaste}
								className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold">
								Paste Link
							</button>
						</div>
					)}
				</div>
			</div>
		</section>
	);
}

function ManualPasteSheet({ value, error, onChange, onOpen, onCancel }) {
	return (
		<div className="fixed inset-0 z-50 flex items-end bg-black/70" role="dialog" aria-modal="true">
			<button className="absolute inset-0" aria-label="Close paste QR sheet" onClick={onCancel} />
			<form
				onSubmit={onOpen}
				className="relative w-full rounded-t-3xl border border-white/10 bg-[#050b16] p-5 text-white shadow-2xl">
				<div className="mx-auto mb-5 h-1.5 w-12 rounded-full bg-white/20" />
				<h2 className="text-xl font-black">Paste QR Link</h2>
				<textarea
					value={value}
					onChange={(event) => onChange(event.target.value)}
					rows={4}
					autoFocus
					placeholder="Paste a Signatura verification or unlock link"
					className="mt-4 w-full resize-none rounded-xl border border-white/15 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 focus:ring-2"
				/>
				{error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
				<div className="mt-4 grid gap-3">
					<button className="rounded-xl bg-red-500 px-5 py-4 text-sm font-bold">Open Link</button>
					<button
						type="button"
						onClick={onCancel}
						className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold">
						Cancel
					</button>
				</div>
			</form>
		</div>
	);
}

export function QrCodeScanner({ accuraLoginOnly = false }) {
	const router = useRouter();
	const scannerRef = useRef(null);
	const processingRef = useRef(false);
	const mountedRef = useRef(true);
	const cameraStartAttemptRef = useRef(0);
	const fileInputRef = useRef(null);
	const scannerElementId = `signatura-qr-reader-${useId().replace(/:/g, '')}`;
	const [screen, setScreen] = useState('camera');
	const [cameraState, setCameraState] = useState('prompt');
	const [error, setError] = useState('');
	const [detected, setDetected] = useState(null);
	const [result, setResult] = useState(null);
	const [manualOpen, setManualOpen] = useState(false);
	const [manualValue, setManualValue] = useState('');
	const [manualError, setManualError] = useState('');
	const [torchSupported, setTorchSupported] = useState(false);
	const [torchOn, setTorchOn] = useState(false);
	const [processingStep, setProcessingStep] = useState(0);
	const processingSteps = [
		'Reading QR data',
		'Verifying signature',
		'Checking issuer',
		'Validating document or unlock request',
	];

	async function stopCamera() {
		cameraStartAttemptRef.current += 1;
		const scanner = scannerRef.current;
		scannerRef.current = null;
		if (scanner) {
			try {
				if (scanner.isScanning) await scanner.stop();
				scanner.clear();
			} catch {
				// Camera may already be stopped by the browser.
			}
		}
		if (mountedRef.current) {
			setTorchOn(false);
			setTorchSupported(false);
		}
	}

	async function handleDetectedPayload(payload) {
		if (processingRef.current) return;
		processingRef.current = true;
		const classified = classifyPayload(payload, accuraLoginOnly);
		await stopCamera();
		if (!mountedRef.current) return;
		setDetected(classified);
		setError('');
		if (shouldAutoContinueScan(classified)) {
			await continueDetected(classified);
			return;
		}
		setScreen('detected');
	}

	async function startCamera() {
		if (processingRef.current || scannerRef.current) return;
		const startAttempt = cameraStartAttemptRef.current + 1;
		cameraStartAttemptRef.current = startAttempt;
		setError('');
		setCameraState('starting');
		setScreen('camera');

		if (!window.isSecureContext && window.location.hostname !== 'localhost') {
			setCameraState('unavailable');
			setError('Camera scanning requires a secure HTTPS connection.');
			return;
		}
		if (!navigator.mediaDevices?.getUserMedia) {
			setCameraState('unavailable');
			setError('Camera is unavailable on this device.');
			return;
		}

		try {
			const [{ Html5Qrcode, Html5QrcodeSupportedFormats }] = await Promise.all([
				loadQrDecoder(),
				waitForScannerContainer(scannerElementId),
				requestCameraAccess(),
			]);
			if (
				!mountedRef.current ||
				processingRef.current ||
				startAttempt !== cameraStartAttemptRef.current
			) {
				return;
			}
			const scanner = new Html5Qrcode(scannerElementId, {
				formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
				useBarCodeDetectorIfSupported: canUseNativeBarcodeDetector(),
				verbose: false,
			});
			scannerRef.current = scanner;
			await scanner.start(
				{ facingMode: 'environment' },
				{
					fps: 20,
					disableFlip: true,
					qrbox: scanRegionQrbox,
					videoConstraints: {
						facingMode: 'environment',
						width: { ideal: 1280 },
						height: { ideal: 720 },
					},
				},
				(decodedText) => void handleDetectedPayload(decodedText),
				() => {},
			);
			if (
				!mountedRef.current ||
				startAttempt !== cameraStartAttemptRef.current
			) {
				await scanner.stop().catch(() => null);
				scanner.clear();
				return;
			}
			removeHtml5QrShading(scannerElementId);
			setCameraState('active');
			void ensureScannerVideoPreview(scannerElementId);
			try {
				const capabilities = scanner.getRunningTrackCameraCapabilities();
				setTorchSupported(capabilities.torchFeature().isSupported());
			} catch {
				setTorchSupported(false);
			}
		} catch (cameraError) {
			await stopCamera();
			if (!mountedRef.current) return;
			const message =
				cameraError instanceof Error ? cameraError.message : String(cameraError || '');
			setCameraState(/permission|notallowed/i.test(message) ? 'denied' : 'unavailable');
			setError(friendlyError(message || 'Unable to start the camera.'));
		}
	}

	function scanAgain() {
		processingRef.current = false;
		setDetected(null);
		setResult(null);
		setError('');
		setScreen('camera');
		if (requiresCameraGesture()) {
			setCameraState('prompt');
			return;
		}
		window.requestAnimationFrame(() => void startCamera());
	}

	function enableCamera() {
		void startCamera();
	}

	async function toggleTorch() {
		const scanner = scannerRef.current;
		if (!scanner || !torchSupported) return;
		try {
			const capability = scanner.getRunningTrackCameraCapabilities().torchFeature();
			await capability.apply(!torchOn);
			setTorchOn(!torchOn);
		} catch {
			setError('Flash is not available for this camera.');
		}
	}

	async function importGallery(event) {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;
		await stopCamera();
		setError('');
		setCameraState('starting');
		try {
			const { Html5Qrcode, Html5QrcodeSupportedFormats } =
				await loadQrDecoder();
			const scanner = new Html5Qrcode(scannerElementId, {
				formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
				useBarCodeDetectorIfSupported: canUseNativeBarcodeDetector(),
				verbose: false,
			});
			const decoded = await scanner.scanFile(file, false);
			scanner.clear();
			await handleDetectedPayload(decoded);
		} catch {
			processingRef.current = false;
			setCameraState('unavailable');
			setError('No QR code found in this image');
		}
	}

	function submitManual(event) {
		event.preventDefault();
		const classified = classifyPayload(manualValue, accuraLoginOnly);
		if (classified.kind === 'invalid') {
			setManualError(classified.error || 'Invalid QR link');
			return;
		}
		setManualError('');
		setManualOpen(false);
		void handleDetectedPayload(manualValue);
	}

	async function continueDetected(classifiedOverride = null) {
		const active = classifiedOverride || detected;
		if (!active || active.kind === 'invalid') return;
		setDetected(active);
		setScreen('processing');
		setProcessingStep(0);
		const timer = window.setInterval(() => {
			setProcessingStep((current) => Math.min(current + 1, processingSteps.length - 1));
		}, 280);
		try {
			if (active.kind === 'document') {
				const response = await fetch(
					`/api/verify/${encodeURIComponent(active.token)}`,
					{ cache: 'no-store' },
				);
				const data = await response.json().catch(() => ({}));
				if (!response.ok) throw new Error(data.error || 'Could not verify this document.');
				const authentic =
					data.token_valid &&
					data.document_hash_match &&
					!['revoked', 'invalid'].includes(String(data.document_status).toLowerCase());
				setResult({
					kind: 'document',
					status: authentic ? 'success' : 'failed',
					message: authentic ? 'The document passed Signatura verification.' : 'The document did not pass all verification checks.',
					viewHref: active.href,
					details: {
						'Document type': data.document_type || 'Signatura document',
						Issuer: data.issuer || data.issuer_name || 'Verified issuer record',
						'Issued to': data.recipient_name === '[REDACTED]' ? 'Private' : data.recipient_name,
						'Issued date': data.issued_at ? new Date(data.issued_at).toLocaleString() : '—',
						'Merkle status': data.merkle_proof_available ? data.anchor_status || 'Available' : 'Not available',
						'Reference ID': data.document_id,
					},
				});
			} else if (active.kind === 'remote-unlock') {
				let challenge = {};
				if (active.requiresLookup) {
					const response = await fetch(
						`/api/hoa-key/remote-unlock/lookup?cid=${encodeURIComponent(active.challengeId)}&code=${encodeURIComponent(active.shortCode)}`,
						{ cache: 'no-store' },
					);
					const data = await response.json().catch(() => ({}));
					if (!response.ok || data?.ok === false) {
						throw new Error(data.error || 'Unable to validate the unlock request.');
					}
					challenge = data.challenge || {};
				}
				setResult({
					kind: 'remote-unlock',
					status: 'success',
					message: 'Review the request before opening the secure approval screen.',
					href: active.href,
					details: {
						'Request source':
							challenge.source || active.details?.['Request source'] || 'HavenxSig',
						Device: challenge.deviceName || challenge.browser || 'Remote browser',
						Action:
							challenge.action ||
							active.details?.Purpose ||
							'Unlock encrypted HOA key',
						HOA: challenge.hoaName || challenge.hoaId || '—',
					},
				});
			} else {
				window.clearInterval(timer);
				router.push(active.href);
				return;
			}
			setProcessingStep(processingSteps.length);
			window.setTimeout(() => mountedRef.current && setScreen('result'), 120);
		} catch (processingError) {
			setResult({
				kind: active.kind,
				status: 'failed',
				message: friendlyError(
					processingError instanceof Error ? processingError.message : '',
				),
			});
			setScreen('result');
		} finally {
			window.clearInterval(timer);
		}
	}

	useEffect(() => {
		mountedRef.current = true;
		processingRef.current = false;
		let cancelled = false;

		async function initCamera() {
			if (!window.isSecureContext && window.location.hostname !== 'localhost') {
				setCameraState('unavailable');
				setError('Camera scanning requires a secure HTTPS connection.');
				return;
			}
			if (!navigator.mediaDevices?.getUserMedia) {
				setCameraState('unavailable');
				setError('Camera is unavailable on this device.');
				return;
			}

			const permission = await readCameraPermissionState();
			if (cancelled) return;

			if (permission === 'denied') {
				setCameraState('denied');
				setError(
					'Camera access was blocked. Enable it in your browser or app settings, then tap Enable camera again.',
				);
				return;
			}

			if (requiresCameraGesture()) {
				setCameraState('prompt');
				return;
			}

			if (permission === 'granted') {
				window.requestAnimationFrame(() => void startCamera());
				return;
			}

			setCameraState('prompt');
		}

		void initCamera();

		return () => {
			cancelled = true;
			mountedRef.current = false;
			processingRef.current = true;
			void stopCamera();
		};
		// Camera permission is checked once when this scanner mounts.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	if (screen === 'detected' && detected) {
		return (
			<QRDetectedPreview
				detected={detected}
				onContinue={() => void continueDetected()}
				onScanAgain={scanAgain}
				onCancel={() => router.back()}
			/>
		);
	}
	if (screen === 'processing') {
		return <QRProcessingStatus steps={processingSteps} activeStep={processingStep} />;
	}
	if (screen === 'result' && result) {
		return (
			<QRVerificationResult
				result={result}
				onDone={() => router.push('/signatura/dashboard')}
				onTryAgain={scanAgain}
				onPaste={() => setManualOpen(true)}
				onContinueRemote={() => router.push(result.href)}
			/>
		);
	}

	const cameraUnavailable = ['denied', 'unavailable'].includes(cameraState);
	const cameraNeedsPrompt = cameraState === 'prompt';
	return (
		<section className="relative min-h-[calc(100dvh-9rem)] overflow-hidden bg-[#020611] text-white">
			<div className="relative h-[70dvh] min-h-[70dvh] overflow-hidden bg-black">
				<div
					id={scannerElementId}
					className="absolute inset-0 z-0 h-full w-full overflow-hidden [&_#qr-shaded-region]:!hidden [&>div]:!h-full [&>div]:!w-full [&_canvas]:!hidden [&_video]:!absolute [&_video]:!inset-0 [&_video]:!z-0 [&_video]:!h-full [&_video]:!w-full [&_video]:!max-w-none [&_video]:!object-cover"
				/>
				<div className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-8">
					<div className="relative aspect-square w-full max-w-[19rem] rounded-[2rem] border-2 border-red-400 shadow-[0_0_0_999px_rgba(2,6,17,0.48),0_0_35px_rgba(239,68,68,0.35)]">
						{cameraState === 'active' ? (
							<div className="absolute left-4 right-4 top-1/2 h-px animate-[signatura-scan-line_2.2s_ease-in-out_infinite] bg-red-400 shadow-[0_0_12px_rgba(248,113,113,0.9)]" />
						) : null}
					</div>
				</div>
				<button
					type="button"
					onClick={() => {
						void stopCamera();
						router.back();
					}}
					className="absolute left-4 top-4 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/45 backdrop-blur"
					aria-label="Close scanner">
					<ArrowLeft className="h-5 w-5" />
				</button>
				{cameraNeedsPrompt ? (
					<div className="absolute inset-0 z-20 grid place-items-center bg-[#020611]/95 px-7 text-center">
						<div>
							<Camera className="mx-auto h-12 w-12 text-red-300" />
							<h2 className="mt-5 text-xl font-black">Enable camera to scan QR codes</h2>
							<p className="mt-3 text-sm leading-6 text-slate-400">
								Tap below and allow camera access when your browser asks.
							</p>
							<div className="mt-6 grid gap-3">
								<button
									type="button"
									onClick={enableCamera}
									className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold">
									Enable camera
								</button>
								<div className="flex justify-center gap-3">
									<button
										type="button"
										onClick={() => setManualOpen(true)}
										className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold">
										Paste QR Link
									</button>
									<button
										type="button"
										onClick={() => fileInputRef.current?.click()}
										className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold">
										Import from Gallery
									</button>
								</div>
							</div>
						</div>
					</div>
				) : null}
				{cameraUnavailable ? (
					<div className="absolute inset-0 z-20 grid place-items-center bg-[#020611]/95 px-7 text-center">
						<div>
							<CameraOff className="mx-auto h-12 w-12 text-red-300" />
							<h2 className="mt-5 text-xl font-black">Allow camera access to scan QR codes</h2>
							<p className="mt-3 text-sm leading-6 text-slate-400">{error}</p>
							<div className="mt-6 flex flex-wrap justify-center gap-3">
								<button
									type="button"
									onClick={enableCamera}
									className="rounded-xl bg-red-500 px-4 py-3 text-sm font-bold">
									Enable camera
								</button>
								<button
									type="button"
									onClick={() => setManualOpen(true)}
									className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold">
									Paste QR Link
								</button>
								<button
									type="button"
									onClick={() => fileInputRef.current?.click()}
									className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold">
									Import from Gallery
								</button>
							</div>
						</div>
					</div>
				) : null}
				{cameraState === 'starting' ? (
					<div className="absolute inset-0 grid place-items-center bg-black/40">
						<LoaderCircle className="h-9 w-9 animate-spin text-red-400" />
					</div>
				) : null}
				<p className="absolute bottom-5 left-0 right-0 text-center text-sm font-semibold text-white drop-shadow">
					Align the QR code inside the frame
				</p>
			</div>

			<div className="border-t border-white/10 bg-[#050b16] px-4 py-5">
				<div className="flex justify-center gap-3">
					<ScannerControl
						icon={torchOn ? FlashlightOff : Flashlight}
						label="Flash"
						active={torchOn}
						disabled={!torchSupported}
						onClick={() => void toggleTorch()}
					/>
					<ScannerControl
						icon={FileImage}
						label="Gallery"
						onClick={() => fileInputRef.current?.click()}
					/>
					<ScannerControl
						icon={Link2}
						label="Paste Link"
						onClick={() => setManualOpen(true)}
					/>
				</div>
				{error && !cameraUnavailable ? (
					<p className="mt-4 text-center text-sm text-red-300">{error}</p>
				) : null}
			</div>

			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				onChange={(event) => void importGallery(event)}
				className="hidden"
			/>
			{manualOpen ? (
				<ManualPasteSheet
					value={manualValue}
					error={manualError}
					onChange={setManualValue}
					onOpen={submitManual}
					onCancel={() => {
						setManualOpen(false);
						setManualError('');
					}}
				/>
			) : null}
			<style jsx global>{`
				@keyframes signatura-scan-line {
					0%,
					100% {
						transform: translateY(-7.5rem);
						opacity: 0.45;
					}
					50% {
						transform: translateY(7.5rem);
						opacity: 1;
					}
				}
			`}</style>
		</section>
	);
}
