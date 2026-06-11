'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function ManualAccountRecoveryPage() {
	const [form, setForm] = useState({
		signaturaId: '',
		email: '',
		handphone: '',
		livenessAcknowledged: false,
	});
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');

	function updateField(event) {
		const { name, value, type, checked } = event.target;
		setForm((current) => ({
			...current,
			[name]: type === 'checkbox' ? checked : value,
		}));
	}

	async function submit(event) {
		event.preventDefault();
		setError('');
		setStatus('Submitting identity recovery request...');

		try {
			const response = await fetch('/api/auth/account-recovery/request', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form),
			});
			const data = await response.json();
			if (!response.ok && response.status !== 202) {
				throw new Error(data.error || 'Unable to submit recovery request');
			}
			setStatus(data.message || 'Recovery request submitted.');
		} catch (submitError) {
			setError(
				submitError instanceof Error
					? submitError.message
					: 'Unable to submit recovery request',
			);
			setStatus('');
		}
	}

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_80%_10%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-10 text-white">
			<div className="mx-auto mb-8 flex max-w-3xl items-center justify-between">
				<Link href="/" className="text-sm font-bold uppercase tracking-[0.18em]">
					Signatura
				</Link>
				<Link href="/account-recovery" className="text-sm font-semibold text-red-200">
					Back
				</Link>
			</div>

			<section className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl">
				<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
					Last-resort account recovery
				</p>
				<h1 className="mt-2 text-3xl font-black">Verified identity review</h1>
				<p className="mt-4 text-sm leading-6 text-slate-300">
					Submit the same email and handphone used during registration, complete
					selfie and liveness verification, then wait for the cooldown review
					period. This path does not reveal encrypted private data.
				</p>

				<form onSubmit={submit} className="mt-6 grid gap-4">
					<label className="grid gap-2 text-sm font-semibold">
						<span>Signatura ID</span>
						<input
							name="signaturaId"
							required
							value={form.signaturaId}
							onChange={updateField}
							className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
						/>
					</label>
					<label className="grid gap-2 text-sm font-semibold">
						<span>Verified email</span>
						<input
							name="email"
							type="email"
							required
							value={form.email}
							onChange={updateField}
							className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
						/>
					</label>
					<label className="grid gap-2 text-sm font-semibold">
						<span>Handphone number</span>
						<input
							name="handphone"
							required
							value={form.handphone}
							onChange={updateField}
							className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
						/>
					</label>
					<label className="flex items-start gap-3 text-sm leading-6 text-slate-300">
						<input
							name="livenessAcknowledged"
							type="checkbox"
							checked={form.livenessAcknowledged}
							onChange={updateField}
							className="mt-1"
						/>
						<span>
							I completed selfie and liveness verification on this device for
							this recovery request.
						</span>
					</label>
					<button className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
						Submit recovery request
					</button>
				</form>

				{status ? <p className="mt-4 text-sm text-slate-200">{status}</p> : null}
				{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
			</section>
		</main>
	);
}
