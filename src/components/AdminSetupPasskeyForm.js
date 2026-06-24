'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
	browserSupportsWebAuthn,
	startRegistration,
} from '@simplewebauthn/browser';

function isStandalonePwa() {
	if (typeof window === 'undefined') return false;
	return (
		window.matchMedia?.('(display-mode: standalone)')?.matches ||
		window.navigator.standalone === true
	);
}

function formatCountdown(expiresAt) {
	if (!expiresAt) return '';
	const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now());
	const minutes = Math.floor(remaining / 60000);
	const seconds = Math.floor((remaining % 60000) / 1000);
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function AdminSetupPasskeyForm({ token = '' }) {
	const router = useRouter();
	const [state, setState] = useState('loading');
	const [user, setUser] = useState(null);
	const [expiresAt, setExpiresAt] = useState('');
	const [countdown, setCountdown] = useState('');
	const [error, setError] = useState('');
	const [status, setStatus] = useState('');
	const [deviceName, setDeviceName] = useState('Admin phone');
	const [installPrompt, setInstallPrompt] = useState(null);
	const [standalone, setStandalone] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const canInstall = Boolean(installPrompt && !standalone);
	const tokenMissing = !String(token || '').trim();

	useEffect(() => {
		setStandalone(isStandalonePwa());
		function handleBeforeInstallPrompt(event) {
			event.preventDefault();
			setInstallPrompt(event);
		}
		window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
		return () => {
			window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
		};
	}, []);

	useEffect(() => {
		if (tokenMissing) {
			setState('invalid');
			setError('Invalid setup link.');
			return;
		}

		let cancelled = false;
		async function validateToken() {
			try {
				setState('loading');
				setError('');
				const response = await fetch('/api/admin/setup-token/validate', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ token }),
				});
				const data = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(data.error || 'Invalid setup link.');
				}
				if (cancelled) return;
				setUser(data.user || null);
				setExpiresAt(data.expiresAt || '');
				setCountdown(formatCountdown(data.expiresAt));
				setState('ready');
			} catch (validationError) {
				if (cancelled) return;
				setState('invalid');
				setError(
					validationError instanceof Error
						? validationError.message
						: 'Invalid setup link.',
				);
			}
		}

		validateToken();
		return () => {
			cancelled = true;
		};
	}, [token, tokenMissing]);

	useEffect(() => {
		if (!expiresAt) return;
		const timer = window.setInterval(() => {
			const nextCountdown = formatCountdown(expiresAt);
			setCountdown(nextCountdown);
			if (nextCountdown === '0:00') {
				setError('This setup QR has expired.');
				setState((current) => (current === 'success' ? current : 'invalid'));
			}
		}, 1000);
		return () => window.clearInterval(timer);
	}, [expiresAt]);

	const title = useMemo(() => {
		if (state === 'success') return 'Admin passkey created successfully.';
		if (state === 'invalid') return 'Setup link unavailable';
		return 'Create Admin Passkey';
	}, [state]);

	async function installPwa() {
		if (!installPrompt) return;
		await installPrompt.prompt();
		await installPrompt.userChoice.catch(() => null);
		setInstallPrompt(null);
		setStandalone(isStandalonePwa());
	}

	async function createPasskey() {
		setError('');
		setStatus('Preparing admin passkey setup...');
		setIsSubmitting(true);

		try {
			if (!browserSupportsWebAuthn()) {
				throw new Error(
					'This browser does not support passkeys. Use a modern phone browser or the existing desktop registration process.',
				);
			}
			const isLocalhost =
				window.location.hostname === 'localhost' ||
				window.location.hostname === '127.0.0.1';
			if (!window.isSecureContext && !isLocalhost) {
				throw new Error('Passkeys require HTTPS. Open the HTTPS Signatura setup link.');
			}

			const startResponse = await fetch('/api/admin/passkey/register/start', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token, deviceName }),
			});
			const startData = await startResponse.json().catch(() => ({}));
			if (!startResponse.ok) {
				throw new Error(startData.error || 'Unable to start admin passkey setup.');
			}
			if (!startData.options) {
				throw new Error('Passkey setup did not return WebAuthn options.');
			}

			setStatus('Approve the phone passkey prompt.');
			const registration = await startRegistration({
				optionsJSON: startData.options,
			});

			setStatus('Verifying passkey and activating admin access...');
			const finishResponse = await fetch('/api/admin/passkey/register/finish', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token, deviceName, response: registration }),
			});
			const finishData = await finishResponse.json().catch(() => ({}));
			if (!finishResponse.ok) {
				throw new Error(finishData.error || 'Unable to finish admin passkey setup.');
			}

			setState('success');
			setStatus('Admin access is ready.');
			window.setTimeout(() => {
				router.replace(finishData.next || '/admin');
			}, 900);
		} catch (setupError) {
			setError(
				setupError instanceof Error
					? setupError.message
					: 'Unable to create admin passkey.',
			);
			setStatus('');
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<section className="mx-auto max-w-xl rounded-lg border border-white/10 bg-slate-950/90 p-6 text-white shadow-2xl">
			<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
				Signatura admin setup
			</p>
			<h1 className="mt-3 text-3xl font-black">{title}</h1>

			{state === 'loading' ? (
				<p className="mt-5 text-sm leading-6 text-slate-300">
					Validating your one-time admin setup link...
				</p>
			) : null}

			{state === 'ready' || state === 'success' ? (
				<div className="mt-5 space-y-4">
					<div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
						<dl className="grid gap-3 text-sm">
							<div className="flex justify-between gap-4">
								<dt className="text-slate-300">Signatura ID</dt>
								<dd className="font-mono text-white">{user?.signaturaId}</dd>
							</div>
							<div className="flex justify-between gap-4">
								<dt className="text-slate-300">Setup QR expires</dt>
								<dd className="font-semibold text-white">{countdown || 'Soon'}</dd>
							</div>
						</dl>
					</div>

					{standalone ? null : (
						<div className="rounded-lg border border-red-300/25 bg-red-500/10 p-4">
							<p className="text-sm font-semibold text-red-100">
								Install Signatura for the best wallet experience.
							</p>
							<p className="mt-2 text-sm leading-6 text-red-50/80">
								Installation is optional. You can continue in this browser and create
								the admin passkey now.
							</p>
							{canInstall ? (
								<button
									type="button"
									onClick={installPwa}
									className="mt-3 rounded-lg border border-red-200/50 px-4 py-2 text-sm font-bold text-red-50">
									Install Signatura
								</button>
							) : null}
						</div>
					)}

					<label className="grid gap-2 text-sm font-semibold text-slate-200">
						Device name
						<input
							value={deviceName}
							onChange={(event) => setDeviceName(event.target.value)}
							className="rounded-lg border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-400/40 focus:ring-4"
							placeholder="Admin phone"
						/>
					</label>

					<button
						type="button"
						onClick={createPasskey}
						disabled={isSubmitting || state === 'success'}
						className="w-full rounded-lg bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60">
						{isSubmitting ? 'Creating passkey...' : 'Create Admin Passkey'}
					</button>
				</div>
			) : null}

			{state === 'invalid' ? (
				<div className="mt-5 rounded-lg border border-red-500/40 bg-red-500/10 p-4">
					<p className="text-sm leading-6 text-red-50">
						{error || 'Invalid setup link.'}
					</p>
					<p className="mt-3 text-sm leading-6 text-red-50/80">
						Return to the desktop admin registration screen and regenerate the QR.
					</p>
				</div>
			) : null}

			{status ? <p className="mt-4 text-sm text-slate-200">{status}</p> : null}
			{error && state !== 'invalid' ? (
				<div className="mt-4 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-sm text-red-50">
					{error}
				</div>
			) : null}

			<div className="mt-6 border-t border-white/10 pt-5 text-sm text-slate-300">
				<Link href="/admin/login?next=/admin" className="font-semibold text-red-200">
					Back to admin sign-in
				</Link>
			</div>
		</section>
	);
}
