'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
	registerAdditionalPasskey,
	reverifyPasskey,
} from '@/lib/passkey-client';
import { PasskeyNotice } from './PasskeyNotice';

async function readJsonResponse(response) {
	const text = await response.text();

	if (!text) {
		return {};
	}

	try {
		return JSON.parse(text);
	} catch {
		return { error: text };
	}
}

function AddPasskeyPanel({
	mode = 'device',
	approvalMethod = 'trusted-device',
	nextPath = '/signatura/dashboard',
}) {
	const [deviceName, setDeviceName] = useState('');
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');
	const [recoveryCodes, setRecoveryCodes] = useState([]);
	const [isComplete, setIsComplete] = useState(false);
	const isRecoveryFlow = approvalMethod === 'recovery-code';
	const trustedDevicesHref = `/signatura/trusted-devices?next=${encodeURIComponent(nextPath)}`;

	async function submit(event) {
		event.preventDefault();
		setError('');
		setRecoveryCodes([]);
		setIsComplete(false);
		setStatus(
			isRecoveryFlow
				? 'Recovery code accepted. Register this device next.'
				: 'First, verify with an existing trusted device.',
		);

		try {
			if (!isRecoveryFlow) {
				await reverifyPasskey();
			}
			setStatus('Now approve registration on this device.');
			await registerAdditionalPasskey(deviceName);

			if (isRecoveryFlow) {
				setStatus('New passkey added. Creating fresh recovery codes...');
				const codesResponse = await fetch('/api/security/recovery-codes', {
					method: 'POST',
				});
				const codesData = await readJsonResponse(codesResponse);

				if (!codesResponse.ok) {
					throw new Error(
						codesData.error ||
							'New passkey was added, but recovery codes could not be created.',
					);
				}

				setRecoveryCodes(codesData.recoveryCodes || []);
			}

			setIsComplete(true);
			setStatus(
				isRecoveryFlow
					? 'New trusted device added. Save your new recovery codes before opening the dashboard.'
					: 'New trusted device added. Other trusted devices will be notified.',
			);
		} catch (addError) {
			setError(addError.message);
			setStatus('');
		}
	}

	return (
		<div className="mx-auto w-full max-w-3xl text-white">
			<div className="mb-6">
				<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
					{mode === 'passkey' ? 'Add passkey' : 'Add trusted device'}
				</p>
				<h1 className="mt-2 text-3xl font-black">
					Register this device with biometric/passkey security.
				</h1>
				{isRecoveryFlow ? (
					<p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
						Your recovery code has restored temporary access. Add a new passkey
						now so you can sign in normally from this device.
					</p>
				) : null}
			</div>

			<PasskeyNotice />

			<div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/90 p-5">
				<h2 className="text-lg font-black">New device approval methods</h2>
				<ul className="mt-4 grid gap-3 text-sm leading-6 text-slate-300">
					<li>
						{isRecoveryFlow
							? 'Recovery code accepted for this setup.'
							: 'Approve from an existing trusted device.'}
					</li>
					<li>Scan a QR code from an existing logged-in device.</li>
					<li>Use a recovery code.</li>
					<li>Use manual identity recovery for high-risk accounts.</li>
				</ul>
				<p className="mt-4 text-sm font-semibold text-red-200">
					Email-only reset or email-only new device approval is not allowed.
				</p>
			</div>

			<form
				onSubmit={submit}
				className="mt-6 rounded-2xl border border-white/10 bg-slate-950/90 p-5">
				<label className="grid gap-2 text-sm font-semibold">
					<span>Device name</span>
					<input
						value={deviceName}
						onChange={(event) => setDeviceName(event.target.value)}
						placeholder="Example: Victor's phone"
						disabled={isComplete}
						className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
					/>
				</label>
				<button
					disabled={isComplete}
					className="mt-4 rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
					{isRecoveryFlow ? 'Register new passkey' : 'Register trusted device'}
				</button>
			</form>

			{status ? <p className="mt-4 text-sm text-slate-200">{status}</p> : null}
			{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

			{recoveryCodes.length > 0 ? (
				<section className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
					<p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-300">
						New recovery codes
					</p>
					<h2 className="mt-2 text-xl font-black text-white">
						Save and secure these codes
					</h2>
					<p className="mt-3 text-sm leading-6 text-emerald-50/90">
						These codes are shown only once. Store them somewhere secure and
						do not send them through messaging apps or email.
					</p>
					<div className="mt-4 grid gap-2 sm:grid-cols-2">
						{recoveryCodes.map((code) => (
							<code
								key={code}
								className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
								{code}
							</code>
						))}
					</div>
				</section>
			) : null}

			{isComplete ? (
				<div className="mt-6 flex flex-col gap-3 sm:flex-row">
					<Link
						href={nextPath || '/signatura/trusted-devices'}
						className="rounded-xl bg-red-500 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-red-400">
						Open main dashboard
					</Link>
					<Link
						href={trustedDevicesHref}
						className="rounded-xl border border-white/15 px-5 py-3 text-center text-sm font-bold text-slate-200 transition hover:border-red-400 hover:text-white">
						View trusted devices
					</Link>
				</div>
			) : null}
		</div>
	);
}

export { AddPasskeyPanel };
