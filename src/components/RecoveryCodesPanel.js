'use client';

import { useEffect, useState } from 'react';
import { reverifyPasskey } from '@/lib/passkey-client';

function RecoveryCodesPanel() {
	const [codes, setCodes] = useState([]);
	const [newCodes, setNewCodes] = useState([]);
	const [status, setStatus] = useState('Loading recovery code status...');
	const [error, setError] = useState('');

	async function loadCodes() {
		const response = await fetch('/api/security/recovery-codes');
		const data = await response.json();
		if (!response.ok) throw new Error(data.error);
		setCodes(data.codes || []);
	}

	useEffect(() => {
		let isMounted = true;

		async function loadInitialCodes() {
			try {
				const response = await fetch('/api/security/recovery-codes');
				const data = await response.json();
				if (!response.ok) throw new Error(data.error);
				if (!isMounted) return;
				setCodes(data.codes || []);
				setStatus('');
			} catch (loadError) {
				if (!isMounted) return;
				setError(loadError.message);
				setStatus('');
			}
		}

		loadInitialCodes();

		return () => {
			isMounted = false;
		};
	}, []);

	async function rotateCodes() {
		setError('');
		setNewCodes([]);
		setStatus('Verify with passkey before changing recovery methods.');

		try {
			await reverifyPasskey();
			const response = await fetch('/api/security/recovery-codes', {
				method: 'POST',
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error);
			setNewCodes(data.recoveryCodes || []);
			await loadCodes();
			setStatus('New recovery codes created. They are shown only once.');
		} catch (rotateError) {
			setError(rotateError.message);
			setStatus('');
		}
	}

	return (
		<div className="mx-auto w-full max-w-4xl text-white">
			<div className="mb-6">
				<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
					Security
				</p>
				<h1 className="mt-2 text-3xl font-black">Recovery codes</h1>
				<p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
					Recovery codes can approve a new trusted device when your existing
					trusted devices are unavailable. Email is only used for notification.
				</p>
			</div>

			<div className="rounded-2xl border border-white/10 bg-slate-950/90 p-5">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 className="font-black">Current recovery code status</h2>
						<p className="mt-1 text-sm text-slate-400">
							{codes.filter((code) => !code.usedAt).length} unused of{' '}
							{codes.length} codes.
						</p>
					</div>
					<button
						onClick={rotateCodes}
						className="rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-400">
						Generate new codes
					</button>
				</div>
				<div className="mt-5 grid gap-2 sm:grid-cols-2">
					{codes.map((code) => (
						<div
							key={code.id}
							className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
							<span className="font-mono">{code.codePrefix}...</span>
							<span className="ml-3 text-slate-400">
								{code.usedAt ? 'Used' : 'Unused'}
							</span>
						</div>
					))}
				</div>
			</div>

			{newCodes.length > 0 ? (
				<div className="mt-6 rounded-2xl border border-amber-400/40 bg-amber-300/10 p-5">
					<h2 className="font-bold text-amber-100">
						New recovery codes, shown only once
					</h2>
					<div className="mt-4 grid gap-2 sm:grid-cols-2">
						{newCodes.map((code) => (
							<code
								key={code}
								className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">
								{code}
							</code>
						))}
					</div>
				</div>
			) : null}

			{status ? <p className="mt-4 text-sm text-slate-200">{status}</p> : null}
			{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
		</div>
	);
}

export { RecoveryCodesPanel };
