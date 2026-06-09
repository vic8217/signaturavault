'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
	browserSupportsWebAuthn,
	startRegistration,
} from '@simplewebauthn/browser';
import { PasskeyNotice } from './PasskeyNotice';

function RegisterPasskeyForm({ nextPath = '/wallet' }) {
	const [form, setForm] = useState({
		deviceName: '',
	});
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');
	const [recoveryCodes, setRecoveryCodes] = useState([]);
	const [createdUserId, setCreatedUserId] = useState('');
	const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;
	const trustedDevicesHref = `/security/devices?next=${encodeURIComponent(nextPath)}`;

	function updateField(event) {
		setForm((current) => ({
			...current,
			[event.target.name]: event.target.value,
		}));
	}

	async function submit(event) {
		event.preventDefault();
		setError('');
		setStatus('Preparing secure device registration...');
		setRecoveryCodes([]);
		setCreatedUserId('');

		if (!browserSupportsWebAuthn()) {
			setError('This browser does not support passkeys/WebAuthn.');
			setStatus('');
			return;
		}

		try {
			const startResponse = await fetch('/api/auth/register/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form),
			});
			const startData = await startResponse.json();
			if (!startResponse.ok) throw new Error(startData.error);

			setStatus('Approve the prompt on this device.');
			const registration = await startRegistration({
				optionsJSON: startData.options,
			});

			setStatus('Verifying cryptographic proof...');
			const finishResponse = await fetch('/api/auth/register/finish', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId: startData.userId,
					deviceName: form.deviceName,
					response: registration,
				}),
			});
			const finishData = await finishResponse.json();
			if (!finishResponse.ok) throw new Error(finishData.error);

			setCreatedUserId(finishData.user?.signaturaId || startData.signaturaId || '');
			setRecoveryCodes(finishData.recoveryCodes || []);
			setStatus('Account created and this device is now trusted.');
		} catch (registrationError) {
			setError(
				registrationError instanceof Error
					? registrationError.message
					: 'Registration failed.',
			);
			setStatus('');
		}
	}

	return (
		<div className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-950/90 p-6 text-white shadow-2xl">
			<div className="mb-6">
				<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
					Document owner account
				</p>
				<h1 className="mt-2 text-3xl font-black">Create your wallet account</h1>
				<p className="mt-3 text-sm leading-6 text-slate-300">
					Issuer admins must use the activation link sent by Dev Admin. This
					page creates a user wallet account only.
				</p>
			</div>

			<PasskeyNotice />

			<form onSubmit={submit} className="mt-6 grid gap-4">
				<label className="grid gap-2 text-sm font-semibold">
					<span>Device name</span>
					<input
						name="deviceName"
						placeholder="Example: Victor's laptop"
						value={form.deviceName}
						onChange={updateField}
						className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
					/>
				</label>
				<button className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
					Register this device
				</button>
			</form>

			{status ? <p className="mt-4 text-sm text-slate-200">{status}</p> : null}
			{createdUserId ? (
				<div className="mt-4 rounded-xl border border-red-300/25 bg-red-500/10 p-4 text-sm text-red-100">
					<p className="font-bold">Signatura ID</p>
					<p className="mt-2 break-all font-mono text-white">{createdUserId}</p>
					<p className="mt-2 text-xs leading-5 text-red-100/75">
						Use this ID when signing in with a passkey.
					</p>
				</div>
			) : null}
			{error ? (
				<div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
					<p>{error}</p>
					{error.includes('Account already exists') ? (
						<div className="mt-3 flex flex-col gap-2 sm:flex-row">
							<Link
								href={loginHref}
								className="rounded-lg bg-red-500 px-4 py-2 text-center text-xs font-bold text-white transition hover:bg-red-400">
								Sign in
							</Link>
							<Link
								href="/login?next=/issuer-portal"
								className="rounded-lg border border-white/15 px-4 py-2 text-center text-xs font-bold text-white transition hover:border-red-400">
								Sign in as issuer
							</Link>
						</div>
					) : null}
				</div>
			) : null}

			{recoveryCodes.length > 0 ? (
				<div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-300/10 p-4">
					<h2 className="font-bold text-amber-100">
						Recovery codes, shown only once
					</h2>
					<p className="mt-2 text-sm leading-6 text-amber-50/90">
						Keep these offline. Email-only recovery is not allowed for this
						account.
					</p>
					<div className="mt-4 grid gap-2 sm:grid-cols-2">
						{recoveryCodes.map((code) => (
							<code
								key={code}
								className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">
								{code}
							</code>
						))}
					</div>
					<div className="mt-5 flex flex-col gap-3 sm:flex-row">
						<Link
							href={nextPath || '/wallet'}
							className="rounded-xl bg-red-500 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-red-400">
							Open main dashboard
						</Link>
						<Link
							href={trustedDevicesHref}
							className="rounded-xl border border-white/15 px-5 py-3 text-center text-sm font-bold text-amber-50 transition hover:border-red-400 hover:text-white">
							View trusted devices
						</Link>
					</div>
				</div>
			) : null}
		</div>
	);
}

export { RegisterPasskeyForm };
