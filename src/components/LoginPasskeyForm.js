'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
	browserSupportsWebAuthn,
	startAuthentication,
} from '@simplewebauthn/browser';
import { PasskeyNotice } from './PasskeyNotice';

function LoginPasskeyForm({ nextPath = '/wallet' }) {
	const [email, setEmail] = useState('');
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const recoveryHref = `/account-recovery?next=${encodeURIComponent(nextPath)}${
		email ? `&email=${encodeURIComponent(email)}` : ''
	}`;

	async function submit(event) {
		event.preventDefault();
		if (isSubmitting) return;
		setError('');
		setIsSubmitting(true);
		setStatus('Preparing passkey login...');

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
				body: JSON.stringify({ email }),
			});
			const startData = await startResponse.json();
			if (!startResponse.ok) throw new Error(startData.error);

			setStatus('Approve the login with your device passkey.');
			const assertion = await startAuthentication({
				optionsJSON: startData.options,
			});

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
			setError(
				loginError instanceof Error ? loginError.message : 'Login failed.',
			);
			setStatus('');
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<div className="mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-slate-950/90 p-6 text-white shadow-2xl">
			<div className="mb-6">
				<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
					Trusted device login
				</p>
				<h1 className="mt-2 text-3xl font-black">
					{nextPath === '/issuer-portal'
						? 'Issuer secure sign-in'
						: 'Sign in with passkey'}
				</h1>
			</div>

			<PasskeyNotice />

			<form onSubmit={submit} className="mt-6 grid gap-4">
				<label className="grid gap-2 text-sm font-semibold">
					<span>Email</span>
					<input
						type="email"
						required
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
					/>
				</label>
				<button
					disabled={isSubmitting}
					className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
					{isSubmitting ? 'Preparing passkey...' : 'Sign in with passkey'}
				</button>
			</form>

			{status ? <p className="mt-4 text-sm text-slate-200">{status}</p> : null}
			{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

			<div className="mt-6 border-t border-white/10 pt-5">
				<Link
					href={recoveryHref}
					className="text-sm font-semibold text-red-200 transition hover:text-white">
					Lost or unavailable trusted device?
				</Link>
				<p className="mt-2 text-xs leading-5 text-slate-400">
					Use another trusted device, a recovery code, or manual identity
					recovery. Email alone cannot restore access.
				</p>
			</div>
		</div>
	);
}

export { LoginPasskeyForm };
