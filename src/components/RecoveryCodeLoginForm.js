'use client';

import { useState } from 'react';

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

function RecoveryCodeLoginForm({
	initialSignaturaId = '',
	nextPath = '/signatura/dashboard',
}) {
	const [signaturaId, setSignaturaId] = useState(initialSignaturaId);
	const [recoveryPhrase, setRecoveryPhrase] = useState('');
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');

	async function submit(event) {
		event.preventDefault();
		setError('');
		setStatus('Verifying recovery phrase...');

		try {
			const response = await fetch('/api/auth/recovery-code', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ signaturaId, recoveryPhrase, next: nextPath }),
			});
			const data = await readJsonResponse(response);

			if (!response.ok) {
				throw new Error(data.error || 'Unable to verify recovery phrase');
			}

			setStatus('Recovery phrase accepted. Register a new trusted device next.');
			window.location.href =
				data.next || '/signatura/trusted-devices/add-passkey?recovered=1';
		} catch (recoverError) {
			setError(
				recoverError instanceof Error
					? recoverError.message
					: 'Unable to verify recovery phrase',
			);
			setStatus('');
		}
	}

	return (
		<form onSubmit={submit} className="mt-6 grid gap-4">
			<label className="grid gap-2 text-sm font-semibold">
				<span>Signatura ID</span>
				<input
					type="text"
					required
					value={signaturaId}
					onChange={(event) => setSignaturaId(event.target.value)}
					autoComplete="username"
					placeholder="SIG-8FD2A91C"
					className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
				/>
			</label>
			<label className="grid gap-2 text-sm font-semibold">
				<span>Recovery phrase</span>
				<textarea
					required
					value={recoveryPhrase}
					onChange={(event) => setRecoveryPhrase(event.target.value)}
					placeholder="anchor beacon canyon ..."
					rows={3}
					className="rounded-xl border border-white/10 bg-white px-4 py-3 font-mono text-slate-950 outline-none ring-red-500 transition focus:ring-2"
				/>
			</label>
			<button className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
				Verify recovery phrase
			</button>

			{status ? <p className="text-sm text-slate-200">{status}</p> : null}
			{error ? <p className="text-sm text-red-300">{error}</p> : null}
		</form>
	);
}

export { RecoveryCodeLoginForm };
