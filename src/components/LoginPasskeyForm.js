'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
	browserSupportsWebAuthn,
	startAuthentication,
} from '@simplewebauthn/browser';
import { LoginTrustedDeviceQrPanel } from './LoginTrustedDeviceQrPanel';

const UNREGISTERED_PASSKEY_ERROR = 'No passkey is registered for this account';
const PASSKEY_DOMAIN_MISMATCH_ERROR =
	'No usable passkey was found for this site. If this SIGNATURA ID was created on localhost or a different ngrok URL, register this phone as a trusted device for the current URL.';

function LoginPasskeyForm({ nextPath = '/signatura/dashboard' }) {
	const [signaturaId, setSignaturaId] = useState('');
	const [step, setStep] = useState('id');
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showLocalPasskey, setShowLocalPasskey] = useState(false);
	const [canRegisterDevice, setCanRegisterDevice] = useState(false);
	const normalizedSignaturaId = signaturaId.trim();
	const createAccountHref = `/register?next=${encodeURIComponent(nextPath)}`;
	const registerDeviceHref = `/register?next=${encodeURIComponent(nextPath)}&signaturaId=${encodeURIComponent(normalizedSignaturaId)}&setup=device`;
	const recoveryPhraseHref = `/account-recovery/recovery-code?next=${encodeURIComponent(nextPath)}`;
	const accountRecoveryHref = `/account-recovery/manual?next=${encodeURIComponent(nextPath)}`;
	const showDeviceRegistration =
		error === UNREGISTERED_PASSKEY_ERROR ||
		error === PASSKEY_DOMAIN_MISMATCH_ERROR ||
		canRegisterDevice;

	useEffect(() => {
		const syncAutofill = () => {
			const input = document.querySelector('input[name="signaturaId"]');
			if (input?.value && !signaturaId.trim()) {
				setSignaturaId(input.value);
			}
		};
		syncAutofill();
		const timer = window.setTimeout(syncAutofill, 250);
		return () => window.clearTimeout(timer);
	}, [signaturaId]);

	function updateSignaturaId(value) {
		setSignaturaId(value);
		if (!value.trim() && step === 'qr') {
			setStep('id');
		}
	}

	function continueToQrLogin() {
		if (!normalizedSignaturaId) {
			setError('Enter your Signatura ID to continue.');
			return;
		}
		setError('');
		setStatus('');
		setStep('qr');
	}

	async function submitLocalPasskey(event) {
		event.preventDefault();
		if (isSubmitting) return;
		setError('');
		setCanRegisterDevice(false);
		setIsSubmitting(true);
		setStatus('Preparing passkey login on this device...');

		try {
			const isLocalhost =
				window.location.hostname === 'localhost' ||
				window.location.hostname === '127.0.0.1';

			if (!window.isSecureContext && !isLocalhost) {
				throw new Error(
					'Passkeys require HTTPS on phones. Open Signatura using a secure HTTPS address, or test on localhost from the same device.',
				);
			}

			if (!browserSupportsWebAuthn()) {
				throw new Error('This browser does not support passkeys/WebAuthn.');
			}

			const startResponse = await fetch('/api/auth/login/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ signaturaId: normalizedSignaturaId }),
			});
			const startData = await startResponse.json();
			if (!startResponse.ok) throw new Error(startData.error);

			setStatus('Approve the login with your device passkey.');
			let assertion;
			const passkeyPromptTimer = window.setTimeout(() => {
				setCanRegisterDevice(true);
				setStatus(
					'Still waiting for a passkey prompt. If nothing appeared, register this phone for the current website address.',
				);
			}, 5000);
			try {
				assertion = await startAuthentication({
					optionsJSON: startData.options,
				});
			} catch {
				throw new Error(PASSKEY_DOMAIN_MISMATCH_ERROR);
			} finally {
				window.clearTimeout(passkeyPromptTimer);
			}

			const finishResponse = await fetch('/api/auth/login/finish', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId: startData.userId,
					next: nextPath,
					response: assertion,
				}),
			});
			const finishData = await finishResponse.json();
			if (!finishResponse.ok) throw new Error(finishData.error);

			setStatus('Login verified. Opening portal...');
			window.location.href = finishData.next || nextPath;
		} catch (loginError) {
			const message =
				loginError instanceof Error ? loginError.message : 'Login failed.';
			if (message === UNREGISTERED_PASSKEY_ERROR) {
				setStatus(
					'No trusted device is registered yet. Opening device registration...',
				);
				window.location.href = registerDeviceHref;
				return;
			}
			setError(message);
			setStatus('');
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<div className="mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-slate-950/90 p-6 text-white shadow-2xl">
			<div className="mb-6">
				<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
					Zero Trust Level 2 sign-in
				</p>
				<h1 className="mt-2 text-3xl font-black">
					{nextPath === '/issuer' || nextPath.startsWith('/issuer/')
						? 'Issuer secure sign-in'
						: 'Sign in to Signatura'}
				</h1>
				<p className="mt-3 text-sm leading-6 text-slate-400">
					Enter your Signatura ID, then approve sign-in from a registered
					trusted device. Password login is not used.
				</p>
			</div>

			{step === 'id' ? (
				<div className="mt-6 grid gap-4">
					<label className="grid gap-2 text-sm font-semibold">
						<span>Signatura ID</span>
						<input
							type="text"
							required
							name="signaturaId"
							value={signaturaId}
							onChange={(event) => updateSignaturaId(event.target.value)}
							onInput={(event) => updateSignaturaId(event.currentTarget.value)}
							autoComplete="username"
							placeholder="SIG-8FD2A91C"
							className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
						/>
					</label>
					<button
						type="button"
						onClick={continueToQrLogin}
						disabled={isSubmitting || !normalizedSignaturaId}
						className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
						Continue
					</button>
					<p className="text-center text-sm text-slate-300">
						New to Signatura?{' '}
						<Link
							href={createAccountHref}
							className="font-semibold text-red-200 transition hover:text-white">
							Register new Signatura account
						</Link>
					</p>
				</div>
			) : null}

			{step === 'qr' && normalizedSignaturaId ? (
				<div className="mt-6">
					<div className="mb-4 flex items-center justify-between gap-3">
						<div>
							<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
								Trusted device approval
							</p>
							<p className="mt-1 text-sm text-slate-300">
								Scan and approve on a device already registered for{' '}
								<span className="font-mono text-white">
									{normalizedSignaturaId}
								</span>
							</p>
						</div>
						<button
							type="button"
							onClick={() => setStep('id')}
							className="text-xs font-semibold text-red-200 transition hover:text-white">
							Change ID
						</button>
					</div>
					<LoginTrustedDeviceQrPanel
						signaturaId={normalizedSignaturaId}
						nextPath={nextPath}
						onCancel={() => setStep('id')}
					/>
				</div>
			) : null}

			<div className="mt-6 border-t border-white/10 pt-5">
				<Link
					href={recoveryPhraseHref}
					className="text-sm font-semibold text-red-200 transition hover:text-white">
					I don&apos;t have access to my trusted device
				</Link>
				<p className="mt-2 text-xs leading-5 text-slate-400">
					Use your recovery phrase to restore access, then register a new
					trusted device.
				</p>
				<Link
					href={accountRecoveryHref}
					className="mt-3 inline-block text-xs font-semibold text-slate-300 transition hover:text-white">
					Last resort: verified email/mobile + liveness review
				</Link>
			</div>

			<div className="mt-6 border-t border-white/10 pt-5">
				<button
					type="button"
					onClick={() => setShowLocalPasskey((current) => !current)}
					className="text-sm font-semibold text-slate-300 transition hover:text-white">
					{showLocalPasskey
						? 'Hide passkey on this device'
						: 'Sign in with passkey on this device (secondary)'}
				</button>
				{showLocalPasskey ? (
					<form onSubmit={submitLocalPasskey} className="mt-4 grid gap-3">
						<p className="text-xs leading-5 text-slate-400">
							Use this only when the current browser already has a registered
							passkey for your Signatura ID.
						</p>
						<button
							disabled={isSubmitting || !normalizedSignaturaId}
							className="rounded-xl border border-red-400/40 bg-red-500/10 px-5 py-3 text-sm font-bold text-red-100 transition hover:border-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50">
							{isSubmitting ? 'Preparing passkey...' : 'Sign in with passkey'}
						</button>
						{normalizedSignaturaId ? (
							<Link
								href={registerDeviceHref}
								className="text-center text-sm font-semibold text-red-200 transition hover:text-white">
								Register this device for this Signatura ID
							</Link>
						) : null}
					</form>
				) : null}
			</div>

			{status ? <p className="mt-4 text-sm text-slate-200">{status}</p> : null}
			{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
			{nextPath !== '/issuer' && !nextPath.startsWith('/issuer/') ? (
				<div className="mt-6 border-t border-white/10 pt-5">
					<Link
						href="/login?next=/issuer"
						className="text-sm font-semibold text-slate-300 transition hover:text-white">
						Sign in as issuer
					</Link>
					<p className="mt-2 text-xs leading-5 text-slate-500">
						Issuer staff authenticate with trusted-device approval and open /issuer
						after sign-in.
					</p>
				</div>
			) : null}

			{showDeviceRegistration ? (
				<div className="mt-4 rounded-xl border border-red-400/40 bg-red-500/10 p-4">
					<p className="text-sm leading-6 text-red-50">
						Use device registration to connect this Signatura ID to the current
						phone and website address.
					</p>
					<Link
						href={registerDeviceHref}
						className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
						Register trusted device for this ID
					</Link>
					<Link
						href={createAccountHref}
						className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-red-100 transition hover:border-red-300">
						Register new Signatura account
					</Link>
				</div>
			) : null}
		</div>
	);
}

export { LoginPasskeyForm };
