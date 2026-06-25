'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
	browserSupportsWebAuthn,
	startAuthentication,
} from '@simplewebauthn/browser';
import { PasskeyNotice } from './PasskeyNotice';

function IssuerActivationForm({ token, isSignedIn = false, signedInSignaturaId = '' }) {
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');
	const [isActivated, setIsActivated] = useState(false);
	const [activatedUser, setActivatedUser] = useState(null);
	const hasToken = useMemo(() => Boolean(token), [token]);
	const activationPath = `/issuer/activate?token=${encodeURIComponent(token || '')}`;
	const loginHref = `/login?next=${encodeURIComponent(activationPath)}`;
	const createHref = `/register?next=${encodeURIComponent(activationPath)}&issuerInvitationToken=${encodeURIComponent(token || '')}`;

	async function submit(event) {
		event.preventDefault();
		setError('');
		setIsActivated(false);
		setActivatedUser(null);
		setStatus('Preparing issuer access confirmation...');

		if (!hasToken) {
			setError('Activation token is missing.');
			setStatus('');
			return;
		}

		if (!browserSupportsWebAuthn()) {
			setError('This browser does not support passkeys/WebAuthn.');
			setStatus('');
			return;
		}

		try {
			const startResponse = await fetch(
				'/api/issuer-invitations/activation/start',
				{
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ token }),
				},
			);
			const startData = await startResponse.json();
			if (!startResponse.ok) throw new Error(startData.error);

			setStatus('Approve with your existing trusted passkey.');
			const credentialResponse = await startAuthentication({
				optionsJSON: startData.options,
			});

			setStatus('Linking issuer access to your Signatura ID...');
			const finishResponse = await fetch(
				'/api/issuer-invitations/activation/finish',
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						token,
						userId: startData.userId,
						invitationId: startData.invitationId,
						mode: startData.mode,
						response: credentialResponse,
					}),
				},
			);
			const finishData = await finishResponse.json();
			if (!finishResponse.ok) throw new Error(finishData.error);

			setStatus('Issuer access activated successfully. Opening issuer portal...');
			setActivatedUser(finishData.user || null);
			setIsActivated(true);
			window.setTimeout(() => {
				window.location.href = finishData.next || '/issuer';
			}, 1800);
		} catch (activationError) {
			setError(activationError.message);
			setStatus('');
		}
	}

	return (
		<div className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-950/90 p-6 text-white shadow-2xl">
			<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
				Issuer activation
			</p>
			<h1 className="mt-2 text-3xl font-black">
				Link issuer access to your Signatura ID
			</h1>

			<div className="mt-5">
				<PasskeyNotice />
			</div>

			<p className="mt-5 text-sm leading-6 text-slate-300">
				Issuer access is a role on your universal Signatura identity. This
				invitation will not create a second Signatura ID for the same person.
			</p>

			{isSignedIn ? (
				<form onSubmit={submit} className="mt-6 grid gap-4">
					{signedInSignaturaId ? (
						<div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
							<p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
								Signed in as
							</p>
							<p className="mt-2 font-mono text-sm font-bold text-white">
								{signedInSignaturaId}
							</p>
						</div>
					) : null}
					<button
						disabled={isActivated}
						className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
						Link issuer access to your Signatura ID
					</button>
				</form>
			) : null}

			{!isSignedIn ? (
				<div className="mt-6 grid gap-3">
					<Link
						href={loginHref}
						className="rounded-xl bg-red-500 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-red-400">
						Continue with existing Signatura ID
					</Link>
					<Link
						href={createHref}
						className="rounded-xl border border-white/15 px-5 py-3 text-center text-sm font-bold text-slate-200 transition hover:border-red-400 hover:text-white">
						Create Signatura ID
					</Link>
				</div>
			) : null}

			{status ? <p className="mt-4 text-sm text-slate-200">{status}</p> : null}
			{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
			{isActivated ? (
				<div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-950/20 p-5">
					<p className="font-bold text-emerald-100">
						Issuer access activated successfully.
					</p>
					<p className="mt-3 text-sm text-slate-200">
						Signatura ID:{' '}
						<span className="font-mono font-bold">
							{activatedUser?.signaturaId || signedInSignaturaId}
						</span>
					</p>
					<p className="mt-1 text-sm text-slate-200">
						Role added: <span className="font-bold">Issuer Admin</span>
					</p>
					<Link
						href="/issuer"
						className="mt-4 inline-flex rounded-xl bg-red-500 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-red-400">
						Open issuer portal
					</Link>
				</div>
			) : null}
		</div>
	);
}

export { IssuerActivationForm };
