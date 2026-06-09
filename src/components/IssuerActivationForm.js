'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
	browserSupportsWebAuthn,
	startAuthentication,
	startRegistration,
} from '@simplewebauthn/browser';
import { PasskeyNotice } from './PasskeyNotice';

function IssuerActivationForm({ token }) {
	const [deviceName, setDeviceName] = useState('');
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');
	const [isActivated, setIsActivated] = useState(false);
	const hasToken = useMemo(() => Boolean(token), [token]);

	async function submit(event) {
		event.preventDefault();
		setError('');
		setIsActivated(false);
		setStatus('Preparing trusted-device activation...');

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
						body: JSON.stringify({ token, deviceName }),
				},
			);
			const startData = await startResponse.json();
			if (!startResponse.ok) throw new Error(startData.error);

			const isExistingPasskey = startData.mode === 'authentication';
			setStatus(
				isExistingPasskey
					? 'Approve with your existing trusted passkey.'
					: 'Approve the prompt on this device.',
			);
			const credentialResponse = isExistingPasskey
				? await startAuthentication({
						optionsJSON: startData.options,
					})
				: await startRegistration({
						optionsJSON: startData.options,
					});

			setStatus('Verifying activation and trusted device...');
			const finishResponse = await fetch(
				'/api/issuer-invitations/activation/finish',
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						token,
						userId: startData.userId,
						invitationId: startData.invitationId,
						deviceName,
						mode: startData.mode,
						response: credentialResponse,
					}),
				},
			);
			const finishData = await finishResponse.json();
			if (!finishResponse.ok) throw new Error(finishData.error);

			setStatus('Activation complete. Opening issuer portal...');
			setIsActivated(true);
			window.location.href = finishData.next || '/issuer-portal';
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
				Activate issuer access with passkey security.
			</h1>

			<div className="mt-5">
				<PasskeyNotice />
			</div>

			<p className="mt-5 text-sm leading-6 text-slate-300">
				The invitation channel only delivered this activation link. It does not
				prove identity, and Signatura never sends passwords or recovery codes
				through messaging apps.
			</p>

			<form onSubmit={submit} className="mt-6 grid gap-4">
					<label className="grid gap-2 text-sm font-semibold">
					<span>Device name</span>
					<input
						value={deviceName}
						onChange={(event) => setDeviceName(event.target.value)}
						placeholder="Example: Finance office laptop"
						className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 focus:ring-2"
					/>
				</label>
				<button
					disabled={isActivated}
					className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
					Activate issuer account
				</button>
			</form>

			{status ? <p className="mt-4 text-sm text-slate-200">{status}</p> : null}
			{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
			{isActivated ? (
				<div className="mt-5 flex flex-col gap-3 sm:flex-row">
					<Link
						href="/issuer-portal"
						className="rounded-xl bg-red-500 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-red-400">
						Open issuer portal
					</Link>
					<Link
						href="/login?next=/issuer-portal"
						className="rounded-xl border border-white/15 px-5 py-3 text-center text-sm font-bold text-slate-200 transition hover:border-red-400 hover:text-white">
						Go to issuer login
					</Link>
				</div>
			) : null}
		</div>
	);
}

export { IssuerActivationForm };
