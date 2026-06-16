'use client';

import { useState } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import {
	browserSupportsWebAuthn,
	startAuthentication,
} from '@simplewebauthn/browser';

function SignaturaAuthorizeForm({
	clientId,
	returnUrl,
	expectedSignaturaId,
	rolePrefix,
	source,
	state,
}) {
	const [signaturaId, setSignaturaId] = useState(expectedSignaturaId || '');
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const normalizedSignaturaId = signaturaId.trim().toUpperCase();
	const expected = String(expectedSignaturaId || '').trim().toUpperCase();
	const matchesExpected = normalizedSignaturaId === expected;

	async function approveLogin() {
		if (isSubmitting) return;
		setError('');
		setStatus('');

		if (!matchesExpected) {
			setError('Enter the exact Signatura ID requested by ACCURA.');
			return;
		}
		if (!browserSupportsWebAuthn()) {
			setError('This browser does not support passkeys/WebAuthn.');
			return;
		}

		const isLocalhost =
			window.location.hostname === 'localhost' ||
			window.location.hostname === '127.0.0.1';
		if (!window.isSecureContext && !isLocalhost) {
			setError('Passkeys require HTTPS on this device.');
			return;
		}

		setIsSubmitting(true);
		try {
			setStatus('Preparing passkey approval...');
			const startResponse = await fetch('/api/auth/login/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ signaturaId: normalizedSignaturaId }),
			});
			const startData = await startResponse.json();
			if (!startResponse.ok) throw new Error(startData.error || 'Unable to start login.');

			setStatus('Approve the ACCURA login with your trusted device passkey.');
			const assertion = await startAuthentication({
				optionsJSON: startData.options,
			});

			setStatus('Creating ACCURA login proof...');
			const finishResponse = await fetch('/api/auth/login/authorize/finish', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					clientId,
					returnUrl,
					expectedSignaturaId: expected,
					rolePrefix,
					source,
					state,
					userId: startData.userId,
					response: assertion,
				}),
			});
			const finishData = await finishResponse.json();
			if (!finishResponse.ok) {
				throw new Error(finishData.error || 'Unable to authorize ACCURA login.');
			}

			setStatus('Authorization verified. Returning to ACCURA...');
			window.location.href = finishData.redirectUrl;
		} catch (authorizeError) {
			setError(
				authorizeError instanceof Error
					? authorizeError.message
					: 'Authorization failed.',
			);
			setStatus('');
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<div>
			<div className="min-w-0 p-4 sm:p-10 lg:p-12">
				<div className="flex items-center gap-4 sm:gap-5">
					<span className="grid h-14 w-14 shrink-0 place-items-center text-red-400 sm:h-16 sm:w-16">
						<ShieldCheck className="h-11 w-11 sm:h-12 sm:w-12" aria-hidden="true" />
					</span>
					<div className="min-w-0">
						<p className="text-2xl font-black sm:text-4xl">
							Approve ACCURA login
						</p>
					</div>
				</div>

				<div className="mt-8 grid gap-5">
					<label className="grid min-w-0 gap-3 text-base font-bold">
						<span>Signatura ID</span>
						<span className="grid h-16 min-w-0 grid-cols-[3rem_auto_minmax(0,1fr)] items-center rounded-lg border border-slate-600/80 bg-[#07111d]/90 px-2 text-slate-100 shadow-inner shadow-black/30 transition focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-500/40 sm:grid-cols-[4rem_auto_minmax(0,1fr)] sm:px-3">
							<span className="grid h-10 w-12 shrink-0 place-items-center rounded-lg border border-red-500/75 bg-[#07111d] text-sm font-black text-red-400 sm:h-11 sm:w-16 sm:text-base">
								SIG
							</span>
							<span className="mx-3 h-9 w-px shrink-0 bg-slate-600 sm:mx-4" />
							<input
								type="text"
								required
								name="signaturaId"
								value={signaturaId}
								onChange={(event) => setSignaturaId(event.target.value)}
								autoComplete="username"
								placeholder="SIG-ACCURA-SADM-FB281C-6736"
								className="block min-w-0 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-500 sm:text-lg"
							/>
						</span>
					</label>

					<div className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-slate-300">
						<p>
							ACCURA expects{' '}
							<span className="font-mono text-white">{expectedSignaturaId}</span>
							{rolePrefix ? (
								<>
									{' '}
									with role prefix{' '}
									<span className="font-mono text-white">{rolePrefix}</span>
								</>
							) : null}
							.
						</p>
					</div>

					<button
						type="button"
						onClick={approveLogin}
						disabled={isSubmitting || !matchesExpected}
						className="group flex h-16 w-full min-w-0 max-w-full items-center justify-center gap-3 rounded-lg bg-red-500 px-4 text-base font-bold text-white shadow-[0_14px_34px_rgba(239,68,68,0.32)] transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:shadow-none sm:gap-4 sm:px-5 sm:text-lg">
						<span>{isSubmitting ? 'Verifying...' : 'Approve with passkey'}</span>
						<ArrowRight
							className="h-6 w-6 transition group-hover:translate-x-1"
							aria-hidden="true"
						/>
					</button>
				</div>

				{status ? (
					<p className="mt-5 rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-slate-200">
						{status}
					</p>
				) : null}
				{error ? (
					<p className="mt-5 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm leading-6 text-red-100">
						{error}
					</p>
				) : null}
			</div>

			<div className="border-t border-white/10 bg-black/15 px-4 py-6 sm:px-10 lg:px-12">
				<div className="flex items-center gap-4 text-slate-400">
					<span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-slate-700 text-red-400">
						<LockKeyhole className="h-7 w-7" aria-hidden="true" />
					</span>
					<p className="text-sm leading-6 sm:text-base">
						ACCURA receives only a short-lived Signatura assertion after your
						passkey and trusted device are verified.
					</p>
				</div>
			</div>
		</div>
	);
}

export { SignaturaAuthorizeForm };
