'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
	browserSupportsWebAuthn,
	startRegistration,
} from '@simplewebauthn/browser';
import { normalizeLoginNextPath } from '@/lib/portalRoutes';
import { PasskeyNotice } from './PasskeyNotice';

function RegisterPasskeyForm({
	nextPath = '/signatura/dashboard',
	initialSignaturaId = '',
	initialAccountType = 'user',
	showIssuerRegistrationLink = false,
	setupMode = '',
}) {
	const router = useRouter();
	const isDeviceSetup = setupMode === 'device' && Boolean(initialSignaturaId);
	const [form, setForm] = useState({
		signaturaId: initialSignaturaId,
		fullName: '',
		handphone: '',
		email: '',
		deviceName: '',
	});
	const accountType = ['issuer', 'admin'].includes(initialAccountType)
		? initialAccountType
		: 'user';
	const [step, setStep] = useState(isDeviceSetup ? 'resume' : 'account');
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');
	const [recoveryPhrase, setRecoveryPhrase] = useState('');
	const [recoveryPhraseSaved, setRecoveryPhraseSaved] = useState(false);
	const [createdAccount, setCreatedAccount] = useState(null);
	const [registrationToken, setRegistrationToken] = useState('');
	const trustedDevicesHref = `/signatura/trusted-devices?next=${encodeURIComponent(nextPath)}`;
	const issuerRegisterHref = `/register?next=${encodeURIComponent('/issuer')}&accountType=issuer`;
	const accountTypeLabel =
		accountType === 'admin'
			? 'Admin account'
			: accountType === 'issuer'
				? 'Issuer account'
				: 'Document owner account';

	function returnToLoginModal() {
		const canonicalNext = normalizeLoginNextPath(nextPath);
		router.push(`/?openLogin=1&next=${encodeURIComponent(canonicalNext)}`);
	}

	function updateField(event) {
		setForm((current) => ({
			...current,
			[event.target.name]: event.target.value,
		}));
	}

	async function createAccount(event) {
		event.preventDefault();
		setError('');
		setStatus('Creating your SIGNATURA ID...');

		try {
			const response = await fetch('/api/auth/register/account', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					fullName: form.fullName,
					handphone: form.handphone,
					email: form.email,
					accountType,
				}),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error);
			setCreatedAccount(data.user);
			setRegistrationToken(data.registrationToken || '');
			setForm((current) => ({
				...current,
				signaturaId: data.user?.signaturaId || current.signaturaId,
			}));
			setRecoveryPhrase('');
			setRecoveryPhraseSaved(false);
			setStatus(
				'Your SIGNATURA ID has been created. Register this device to finish setup and receive your recovery phrase.',
			);
			setStep('device');
		} catch (accountError) {
			setError(
				accountError instanceof Error
					? accountError.message
					: 'Account creation failed.',
			);
			setStatus('');
		}
	}

	async function registerDevice(event) {
		event.preventDefault();
		setError('');
		setStatus('Preparing trusted device registration...');
		setRecoveryPhrase('');
		setRecoveryPhraseSaved(false);

		if (!browserSupportsWebAuthn()) {
			setError('This browser does not support passkeys/WebAuthn.');
			setStatus('');
			return;
		}
		const isLocalhost =
			window.location.hostname === 'localhost' ||
			window.location.hostname === '127.0.0.1';
		if (!window.isSecureContext && !isLocalhost) {
			setError(
				'Passkeys require HTTPS on phones. Open Signatura using the HTTPS ngrok URL, then try again.',
			);
			setStatus('');
			return;
		}

		try {
			const startResponse = await fetch('/api/auth/register/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId: createdAccount?.id,
					registrationToken,
					deviceName: form.deviceName,
				}),
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

			setCreatedAccount(finishData.user || createdAccount);
			setRecoveryPhrase(finishData.recoveryPhrase || '');
			setRecoveryPhraseSaved(false);
			setStatus('This device is now trusted.');
			setStep('recovery');
		} catch (registrationError) {
			setError(
				registrationError instanceof Error
					? registrationError.message
					: 'Registration failed.',
			);
			setStatus('');
		}
	}

	async function resumeSetup(event) {
		event.preventDefault();
		setError('');
		setStatus('Verifying your SIGNATURA ID...');
		setRecoveryPhrase('');
		setRecoveryPhraseSaved(false);
		setCreatedAccount(null);
		setRegistrationToken('');

		try {
			const response = await fetch('/api/auth/register/resume', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					signaturaId: form.signaturaId,
					handphone: form.handphone,
					email: form.email,
				}),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error);
			setCreatedAccount(data.user);
			setRegistrationToken(data.registrationToken || '');
			setStatus('Your SIGNATURA ID is ready for trusted device registration.');
			setStep('device');
		} catch (resumeError) {
			setError(
				resumeError instanceof Error
					? resumeError.message
					: 'Unable to resume account setup.',
			);
			setStatus('');
		}
	}

	return (
		<div className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-950/90 p-6 text-white shadow-2xl">
			<div className="mb-6">
				<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
					{isDeviceSetup ? 'Trusted device setup' : accountTypeLabel}
				</p>
				<h1 className="mt-2 text-3xl font-black">
					{isDeviceSetup
						? 'Register trusted device'
						: 'Create your SIGNATURA account'}
				</h1>
				<p className="mt-3 text-sm leading-6 text-slate-300">
					{isDeviceSetup
						? 'Verify your SIGNATURA ID with the same email and handphone number used during account creation, then register this device.'
						: accountType === 'issuer'
							? 'Enter your issuer details to generate an issuer SIGNATURA ID. Your private contact information is encrypted before it is saved.'
							: accountType === 'admin'
								? 'Enter authorized administrator details to generate an admin SIGNATURA ID. Your private contact information is encrypted before it is saved.'
								: 'Enter your details to generate your SIGNATURA ID. Your private contact information is encrypted before it is saved.'}
				</p>
				{!isDeviceSetup ? (
					<div className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 p-4 text-sm leading-6 text-red-50/90">
						Your name, handphone number, and email are protected as encrypted
						private fields. System admins and database managers cannot read them
						directly from the database. Signatura uses Zero Trust Level 2
						controls for this flow.
					</div>
				) : null}
			</div>

			{step === 'account' ? (
				<form onSubmit={createAccount} className="mt-6 grid gap-4">
					{accountType !== 'user' ? (
						<div className="rounded-xl border border-red-300/20 bg-red-500/10 p-4 text-sm leading-6 text-red-50/90">
							<p className="font-bold">
								{accountType === 'admin'
									? 'Admin Signatura ID'
									: 'Issuer Signatura ID'}
							</p>
							<p className="mt-1">
								{accountType === 'admin'
									? 'Admin IDs are provisioned from the admin URL only. Production blocks public admin self-registration.'
									: 'Issuer IDs use the SIG-I prefix. Issuer portal access still requires an active issuer tenant or invitation.'}
							</p>
						</div>
					) : null}
					<label className="grid gap-2 text-sm font-semibold">
						<span>Full name</span>
						<input
							name="fullName"
							placeholder="Example: Victor Santos"
							value={form.fullName}
							onChange={updateField}
							autoComplete="name"
							className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
						/>
					</label>
					<label className="grid gap-2 text-sm font-semibold">
						<span>Handphone number</span>
						<input
							name="handphone"
							placeholder="Example: +63 917 000 0000"
							value={form.handphone}
							onChange={updateField}
							autoComplete="tel"
							className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
						/>
					</label>
					<label className="grid gap-2 text-sm font-semibold">
						<span>Email address</span>
						<input
							name="email"
							type="email"
							placeholder="Example: victor@example.com"
							value={form.email}
							onChange={updateField}
							autoComplete="email"
							className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
						/>
					</label>
					<div className="grid gap-3 sm:grid-cols-2">
						<button className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
							Create SIGNATURA ID
						</button>
						<button
							type="button"
							onClick={returnToLoginModal}
							className="rounded-xl border border-red/15 px-5 hover:border-red-400 py-3 text-sm font-bold text-red-100 transition hover:text-red-400">
							Cancel
						</button>
					</div>
				</form>
			) : null}

			{step === 'resume' ? (
				<form onSubmit={resumeSetup} className="mt-6 grid gap-4">
					<label className="grid gap-2 text-sm font-semibold">
						<span>Signatura ID</span>
						<input
							name="signaturaId"
							placeholder="SIG-XXXX-XXXX"
							value={form.signaturaId}
							onChange={updateField}
							autoComplete="username"
							className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
						/>
					</label>
					<label className="grid gap-2 text-sm font-semibold">
						<span>Handphone number</span>
						<input
							name="handphone"
							placeholder="Example: +63 917 000 0000"
							value={form.handphone}
							onChange={updateField}
							autoComplete="tel"
							className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
						/>
					</label>
					<label className="grid gap-2 text-sm font-semibold">
						<span>Email address</span>
						<input
							name="email"
							type="email"
							placeholder="Example: victor@example.com"
							value={form.email}
							onChange={updateField}
							autoComplete="email"
							className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
						/>
					</label>
					<div className="grid gap-3 sm:grid-cols-2">
						<button className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
							Continue
						</button>
						<button
							type="button"
							onClick={returnToLoginModal}
							className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-red-100 transition hover:border-red-300 hover:text-white">
							Cancel
						</button>
					</div>
				</form>
			) : null}

			{status ? <p className="mt-4 text-sm text-slate-200">{status}</p> : null}
			{createdAccount?.signaturaId && step !== 'account' ? (
				<div className="mt-4 rounded-xl border border-red-300/25 bg-red-500/10 p-4 text-sm text-red-100">
					<p className="font-bold">SIGNATURA ID</p>
					<p className="mt-2 break-all font-mono text-white">
						{createdAccount.signaturaId}
					</p>
				</div>
			) : null}

			{step === 'device' ? (
				<div className="mt-6">
					<PasskeyNotice />
					<form onSubmit={registerDevice} className="mt-6 grid gap-4">
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
						<div className="grid gap-3 sm:grid-cols-2">
							<button className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
								Register trusted device
							</button>
							<button
								type="button"
								onClick={returnToLoginModal}
								className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-red-100 transition hover:border-red-300 hover:text-white">
								Cancel
							</button>
						</div>
					</form>
				</div>
			) : null}
			{error ? (
				<div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
					<p>{error}</p>
					{error.includes('Account already exists') ? (
						<div className="mt-3 flex flex-col gap-2 sm:flex-row">
							<button
								type="button"
								onClick={returnToLoginModal}
								className="rounded-lg bg-red-500 px-4 py-2 text-center text-xs font-bold text-white transition hover:bg-red-400">
								Sign in
							</button>
							<Link
								href="/login?next=/issuer"
								className="rounded-lg border border-white/15 px-4 py-2 text-center text-xs font-bold text-white transition hover:border-red-400">
								Sign in as issuer
							</Link>
						</div>
					) : null}
				</div>
			) : null}

			{step === 'recovery' && recoveryPhrase ? (
				<div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-300/10 p-4">
					<h2 className="font-bold text-amber-100">
						Recovery phrase, shown only once
					</h2>
					<p className="mt-2 text-sm leading-6 text-amber-50/90">
						Write this phrase offline. It authorizes account and device recovery
						only. It does not reveal your encrypted private data.
					</p>
					<p className="mt-4 rounded-lg bg-slate-900 px-4 py-3 font-mono text-sm leading-7 text-white">
						{recoveryPhrase}
					</p>
					<label className="mt-4 flex items-start gap-3 text-sm leading-6 text-amber-50/90">
						<input
							type="checkbox"
							checked={recoveryPhraseSaved}
							onChange={(event) => setRecoveryPhraseSaved(event.target.checked)}
							className="mt-1"
						/>
						<span>
							I saved my recovery phrase in a secure offline location.
						</span>
					</label>
					<div className="mt-5 flex flex-col gap-3 sm:flex-row">
						<button
							type="button"
							disabled={!recoveryPhraseSaved}
							onClick={() => setStep('complete')}
							className="rounded-xl bg-red-500 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
							Continue to dashboard
						</button>
						<button
							type="button"
							onClick={returnToLoginModal}
							className="rounded-xl border border-white/15 px-5 py-3 text-center text-sm font-bold text-red-100 transition hover:border-red-300 hover:text-white">
							Return to login
						</button>
					</div>
				</div>
			) : null}

			{step === 'complete' ? (
				<div className="mt-6 flex flex-col gap-3 sm:flex-row">
					<Link
						href={nextPath || '/signatura/dashboard'}
						className="rounded-xl bg-red-500 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-red-400">
						Open main dashboard
					</Link>
					<Link
						href={trustedDevicesHref}
						className="rounded-xl border border-white/15 px-5 py-3 text-center text-sm font-bold text-amber-50 transition hover:border-red-400 hover:text-white">
						View trusted devices
					</Link>
				</div>
			) : null}

			{!isDeviceSetup ? (
				<div className="mt-6 border-t border-white/10 pt-5">
					{showIssuerRegistrationLink ? (
						<Link
							href={issuerRegisterHref}
							className="mb-3 inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-red-100 transition hover:border-red-300 hover:text-white">
							Create issuer Signatura ID
						</Link>
					) : null}
					{accountType === 'admin' ? (
						<Link
							href="/login?next=/admin"
							className="text-sm font-semibold text-slate-300 transition hover:text-white">
							Already an admin? Sign in to /admin
						</Link>
					) : (
						<Link
							href="/login?next=/issuer"
							className="text-sm font-semibold text-slate-300 transition hover:text-white">
							Already an issuer? Sign in to /issuer
						</Link>
					)}
				</div>
			) : null}
		</div>
	);
}

export { RegisterPasskeyForm };
