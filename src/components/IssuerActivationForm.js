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
	const [bootstrapAccount, setBootstrapAccount] = useState(null);
	const [registrationSessionId, setRegistrationSessionId] = useState('');
	const [recoveryPhrase, setRecoveryPhrase] = useState('');
	const [recoveryPhraseAlreadyIssued, setRecoveryPhraseAlreadyIssued] = useState(false);
	const [recoveryPhraseSaved, setRecoveryPhraseSaved] = useState(false);
	const hasToken = useMemo(() => Boolean(token), [token]);

	async function submit(event) {
		event.preventDefault();
		setError('');
		setIsActivated(false);
		setBootstrapAccount(null);
		setRegistrationSessionId('');
		setRecoveryPhrase('');
		setRecoveryPhraseAlreadyIssued(false);
		setRecoveryPhraseSaved(false);
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

			if (finishData.requiresRecovery) {
				setStatus('Trusted device registered. Preparing your recovery phrase...');
				const recoveryResponse = await fetch('/api/auth/register/recovery', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						userId: finishData.user?.id || startData.userId,
						registrationSessionId: finishData.registrationSessionId,
					}),
				});
				const recoveryData = await recoveryResponse.json();
				if (!recoveryResponse.ok) throw new Error(recoveryData.error);
				setBootstrapAccount(recoveryData.user || finishData.user);
				setRegistrationSessionId(
					recoveryData.registrationSessionId || finishData.registrationSessionId || '',
				);
				setRecoveryPhrase(recoveryData.recoveryPhrase || '');
				setRecoveryPhraseAlreadyIssued(
					Boolean(recoveryData.recoveryPhraseAlreadyIssued),
				);
				setStatus(
					recoveryData.recoveryPhraseAlreadyIssued
						? 'Recovery phrase already exists. Confirm it was saved to activate issuer access.'
						: 'Save this recovery phrase before activating issuer access.',
				);
				return;
			}

			setStatus('Activation complete. Opening issuer portal...');
			setIsActivated(true);
			window.location.href = finishData.next || '/issuer';
		} catch (activationError) {
			setError(activationError.message);
			setStatus('');
		}
	}

	async function activateBootstrapAccount() {
		setError('');
		setStatus('Activating issuer access...');
		try {
			const response = await fetch('/api/auth/register/activate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId: bootstrapAccount?.id,
					registrationSessionId,
				}),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error);
			setStatus('Activation complete. Opening issuer portal...');
			setIsActivated(true);
			window.location.href = data.redirectTo || '/issuer';
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

			{bootstrapAccount ? (
				<section className="mt-6 rounded-2xl border border-red-400/30 bg-red-950/30 p-5">
					<p className="text-xs font-bold uppercase tracking-[0.18em] text-red-200">
						Recovery kit
					</p>
					<h2 className="mt-2 text-xl font-black">Save your recovery phrase.</h2>
					{recoveryPhrase ? (
						<pre className="mt-4 whitespace-pre-wrap rounded-xl border border-white/10 bg-slate-950 p-4 font-mono text-sm leading-6 text-white">
							{recoveryPhrase}
						</pre>
					) : (
						<p className="mt-3 text-sm leading-6 text-slate-300">
							Your recovery phrase was already generated. Confirm that you saved
							it before activating issuer access.
						</p>
					)}
					<label className="mt-4 flex items-start gap-3 text-sm font-semibold text-slate-100">
						<input
							type="checkbox"
							checked={recoveryPhraseSaved}
							onChange={(event) => setRecoveryPhraseSaved(event.target.checked)}
							className="mt-1 h-4 w-4 accent-red-500"
						/>
						<span>
							I saved my recovery phrase in a secure offline location.
						</span>
					</label>
					<button
						type="button"
						disabled={!recoveryPhraseSaved || isActivated}
						onClick={activateBootstrapAccount}
						className="mt-5 w-full rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
						Activate issuer access
					</button>
					{recoveryPhraseAlreadyIssued ? (
						<p className="mt-3 text-xs leading-5 text-red-100">
							Signatura will not show an existing recovery phrase again.
						</p>
					) : null}
				</section>
			) : null}

			{status ? <p className="mt-4 text-sm text-slate-200">{status}</p> : null}
			{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
			{isActivated ? (
				<div className="mt-5 flex flex-col gap-3 sm:flex-row">
					<Link
						href="/issuer"
						className="rounded-xl bg-red-500 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-red-400">
						Open issuer portal
					</Link>
					<Link
						href="/login?next=/issuer"
						className="rounded-xl border border-white/15 px-5 py-3 text-center text-sm font-bold text-slate-200 transition hover:border-red-400 hover:text-white">
						Go to issuer login
					</Link>
				</div>
			) : null}
		</div>
	);
}

export { IssuerActivationForm };
