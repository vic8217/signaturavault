'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PortalIcon } from './PortalIcon';

function buildChallengeHref(pathname, challengeId, shortCode, signaturaId = '') {
	const params = new URLSearchParams();
	params.set('cid', challengeId);
	params.set('code', String(shortCode).trim().toUpperCase());
	if (signaturaId) {
		params.set('signaturaId', String(signaturaId).trim().toUpperCase());
	}
	return `${pathname}?${params.toString()}`;
}

function getRemoteUnlockHref(payload) {
	const raw = String(payload || '').trim();
	if (!raw) return null;

	try {
		const parsed = JSON.parse(raw);
		const challengeId = parsed.cid || parsed.challengeId || parsed.id;
		const shortCode = parsed.code || parsed.shortCode;
		if (challengeId && shortCode) {
			return buildChallengeHref(
				'/hoa-key/remote-unlock',
				challengeId,
				shortCode,
			);
		}
	} catch {
		// Not JSON. Keep trying URL and token formats.
	}

	try {
		const url = new URL(raw);
		const challengeId =
			url.searchParams.get('cid') ||
			url.searchParams.get('challengeId') ||
			url.searchParams.get('id');
		const shortCode = url.searchParams.get('code') || url.searchParams.get('shortCode');
		const signaturaId =
			url.searchParams.get('signaturaId') || url.searchParams.get('signatura_id');
		if (challengeId && shortCode) {
			if (url.pathname.includes('/login/remote-approve')) {
				return buildChallengeHref(
					'/login/remote-approve',
					challengeId,
					shortCode,
					signaturaId,
				);
			}
			return buildChallengeHref(
				'/hoa-key/remote-unlock',
				challengeId,
				shortCode,
				signaturaId,
			);
		}

		const verifyToken =
			url.searchParams.get('token') ||
			url.pathname.match(/\/verify\/([^/?#]+)/)?.[1] ||
			url.pathname.match(/\/api\/verify\/([^/?#]+)/)?.[1];
		if (verifyToken) {
			return `/verify?token=${encodeURIComponent(verifyToken)}`;
		}
	} catch {
		// Not an absolute URL. Keep trying relative paths and plain tokens.
	}

	if (raw.startsWith('/')) {
		try {
			const url = new URL(raw, window.location.origin);
			return getRemoteUnlockHref(url.toString());
		} catch {
			return null;
		}
	}

	if (/^QR[-_A-Z0-9]{8,}$/i.test(raw) || /^VER[-_A-Z0-9]{8,}$/i.test(raw)) {
		return `/verify?token=${encodeURIComponent(raw)}`;
	}

	return null;
}

export function QrCodeScanner() {
	const router = useRouter();
	const scannerRef = useRef(null);
	const scannerElementId = `signatura-qr-reader-${useId().replace(/:/g, '')}`;
	const [status, setStatus] = useState('Camera is off.');
	const [error, setError] = useState('');
	const [manualValue, setManualValue] = useState('');
	const [isScanning, setIsScanning] = useState(false);
	const [lastPayload, setLastPayload] = useState('');

	async function stopCamera() {
		const scanner = scannerRef.current;
		scannerRef.current = null;
		if (scanner) {
			try {
				if (scanner.isScanning) await scanner.stop();
				scanner.clear();
			} catch {
				// The camera may already have stopped while the PWA was backgrounded.
			}
		}
		setIsScanning(false);
	}

	function routePayload(payload) {
		const href = getRemoteUnlockHref(payload);
		setLastPayload(payload);
		if (!href) {
			setError('QR code was read, but it is not a supported Signatura code.');
			setStatus('Point the camera at a Signatura unlock or verification QR.');
			return false;
		}
		void stopCamera();
		setStatus('QR code detected. Opening Signatura approval...');
		router.push(href);
		return true;
	}

	async function startCamera() {
		setError('');
		setLastPayload('');

		if (!window.isSecureContext && window.location.hostname !== 'localhost') {
			setError('Camera scanning requires HTTPS. Open Signatura through the HTTPS ngrok URL.');
			return;
		}

		if (!navigator.mediaDevices?.getUserMedia) {
			setError('This device does not provide camera access to the installed app.');
			return;
		}

		try {
			const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import(
				'html5-qrcode'
			);
			const scanner = new Html5Qrcode(scannerElementId, {
				formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
				verbose: false,
			});
			scannerRef.current = scanner;
			await scanner.start(
				{ facingMode: 'environment' },
				{
					fps: 12,
					qrbox: (viewfinderWidth, viewfinderHeight) => {
						const edge = Math.floor(
							Math.min(viewfinderWidth, viewfinderHeight) * 0.72,
						);
						return { width: edge, height: edge };
					},
					aspectRatio: 1,
					disableFlip: false,
				},
				(decodedText) => {
					routePayload(decodedText);
				},
				() => {
					// Missing a QR code in an individual frame is expected.
				},
			);
			setIsScanning(true);
			setStatus('Scanning. Hold the QR code inside the red frame.');
		} catch (cameraError) {
			await stopCamera();
			const message =
				cameraError instanceof Error
					? cameraError.message
					: String(cameraError || '');
			setError(
				/permission|notallowed/i.test(message)
					? 'Camera permission was denied. Allow camera access for Signatura in Android app/site settings, then retry.'
					: message || 'Unable to start the camera.',
			);
			setStatus('Camera is off.');
		}
	}

	function submitManual(event) {
		event.preventDefault();
		setError('');
		if (!routePayload(manualValue)) {
			setStatus('Paste a Signatura QR link or token, then try again.');
		}
	}

	useEffect(() => {
		return () => {
			void stopCamera();
		};
	}, []);

	return (
		<section className="space-y-5">
			<div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
				<div className="relative aspect-[3/4] max-h-[70vh] bg-black sm:aspect-video">
					<div
						id={scannerElementId}
						className="h-full w-full overflow-hidden [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
					/>
					<div className="pointer-events-none absolute inset-0 grid place-items-center p-8">
						<div className="aspect-square w-full max-w-72 rounded-3xl border-4 border-red-400/80 shadow-[0_0_0_999px_rgba(2,6,23,0.45)]" />
					</div>
					{!isScanning ? (
						<div className="absolute inset-0 grid place-items-center bg-slate-950/80 p-6 text-center">
							<div>
								<div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-red-500/40 bg-slate-900 text-red-300">
									<PortalIcon name="scanner" className="h-8 w-8" />
								</div>
								<p className="mt-4 text-sm font-semibold text-white">
									Start the camera to scan a Signatura QR code.
								</p>
							</div>
						</div>
					) : null}
				</div>
			</div>

			<div className="flex flex-col gap-3 sm:flex-row">
				<button
					type="button"
					onClick={startCamera}
					disabled={isScanning}
					className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
					{isScanning ? 'Scanning...' : 'Start QR scanner'}
				</button>
				<button
					type="button"
					onClick={() => void stopCamera()}
					className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-slate-100 transition hover:border-red-300">
					Stop camera
				</button>
			</div>

			{status ? <p className="text-sm text-slate-300">{status}</p> : null}
			{error ? (
				<p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
					{error}
				</p>
			) : null}

			<form
				onSubmit={submitManual}
				className="rounded-2xl border border-white/10 bg-white/4 p-4">
				<label className="grid gap-2 text-sm font-semibold text-white">
					<span>Paste QR text or link</span>
					<textarea
						value={manualValue}
						onChange={(event) => setManualValue(event.target.value)}
						rows={3}
						placeholder="https://.../hoa-key/remote-unlock?cid=...&code=..."
						className="resize-none rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
					/>
				</label>
				<button className="mt-3 w-full rounded-xl border border-red-400/50 px-5 py-3 text-sm font-bold text-red-100 transition hover:border-red-300 hover:bg-red-500/10">
					Open scanned code
				</button>
			</form>

			{lastPayload ? (
				<div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
					<p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
						Last scanned value
					</p>
					<p className="mt-2 break-all font-mono text-xs text-slate-300">
						{lastPayload}
					</p>
				</div>
			) : null}
		</section>
	);
}
