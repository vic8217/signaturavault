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

function RecoveryCodeLoginForm({ initialEmail = '', nextPath = '/wallet' }) {
	const [email, setEmail] = useState(initialEmail);
	const [recoveryCode, setRecoveryCode] = useState('');
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');

	async function submit(event) {
		event.preventDefault();
		setError('');
		setStatus('Verifying recovery code...');

		try {
			const response = await fetch('/api/auth/recovery-code', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, recoveryCode, next: nextPath }),
			});
			const data = await readJsonResponse(response);

			if (!response.ok) {
				throw new Error(data.error || 'Unable to verify recovery code');
			}

			setStatus('Recovery code accepted. Register a new trusted device next.');
			window.location.href = data.next || '/security/add-passkey?recovered=1';
		} catch (recoverError) {
			setError(
				recoverError instanceof Error
					? recoverError.message
					: 'Unable to verify recovery code',
			);
			setStatus('');
		}
	}

	return (
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
			<label className="grid gap-2 text-sm font-semibold">
				<span>Recovery code</span>
				<input
					required
					value={recoveryCode}
					onChange={(event) => setRecoveryCode(event.target.value)}
					placeholder="SGN-XXXXXXX-XXXXXXX"
					className="rounded-xl border border-white/10 bg-white px-4 py-3 font-mono text-slate-950 outline-none ring-red-500 transition focus:ring-2"
				/>
			</label>
			<button className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
				Verify recovery code
			</button>

			{status ? <p className="text-sm text-slate-200">{status}</p> : null}
			{error ? <p className="text-sm text-red-300">{error}</p> : null}
		</form>
	);
}

export { RecoveryCodeLoginForm };
