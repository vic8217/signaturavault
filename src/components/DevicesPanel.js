'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { reverifyPasskey } from '@/lib/passkey-client';
import { PasskeyNotice } from './PasskeyNotice';

function formatDate(value) {
	if (!value) return 'Never';
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(value));
}

function DevicesPanel({ returnPath = '' }) {
	const [devices, setDevices] = useState([]);
	const [status, setStatus] = useState('Loading trusted devices...');
	const [error, setError] = useState('');
	const returnToLoginHref = returnPath
		? `/login?next=${encodeURIComponent(returnPath)}`
		: '';
	const addDeviceHref = returnPath
		? `/security/add-device?next=${encodeURIComponent(returnPath)}`
		: '/security/add-device';

	async function loadDevices() {
		const response = await fetch('/api/security/devices');
		const data = await response.json();
		if (!response.ok) throw new Error(data.error);
		setDevices(data.devices || []);
	}

	useEffect(() => {
		let isMounted = true;

		async function loadInitialDevices() {
			try {
				const response = await fetch('/api/security/devices');
				const data = await response.json();
				if (!response.ok) throw new Error(data.error);
				if (!isMounted) return;
				setDevices(data.devices || []);
				setStatus('');
			} catch (loadError) {
				if (!isMounted) return;
				setError(loadError.message);
				setStatus('');
			}
		}

		loadInitialDevices();

		return () => {
			isMounted = false;
		};
	}, []);

	async function verify() {
		setError('');
		setStatus('Approve the verification prompt on a trusted device.');
		try {
			await reverifyPasskey();
			setStatus('Recent passkey verification complete.');
		} catch (verifyError) {
			setError(verifyError.message);
			setStatus('');
		}
	}

	async function removeDevice(deviceId) {
		setError('');
		setStatus('Removing trusted device...');
		try {
			let response = await fetch(`/api/security/devices/${deviceId}`, {
				method: 'DELETE',
			});
			let data = await response.json();

			if (response.status === 403) {
				await reverifyPasskey();
				response = await fetch(`/api/security/devices/${deviceId}`, {
					method: 'DELETE',
				});
				data = await response.json();
			}

			if (!response.ok) throw new Error(data.error);
			await loadDevices();
			setStatus('Trusted device removed.');
		} catch (removeError) {
			setError(removeError.message);
			setStatus('');
		}
	}

	return (
		<div className="mx-auto w-full max-w-5xl text-white">
			<div className="mb-6">
				<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
					Security
				</p>
				<h1 className="mt-2 text-3xl font-black">Trusted devices</h1>
			</div>

			<PasskeyNotice />

			{returnPath ? (
				<div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/90 p-5">
					<Link
						href={returnToLoginHref}
						className="inline-flex rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
						Return to passkey login
					</Link>
					<p className="mt-3 text-sm leading-6 text-slate-400">
						Continue the sign-in request that opened this trusted-device setup.
					</p>
				</div>
			) : null}

			<div className="mt-6 flex flex-wrap gap-3">
				<Link
					href={addDeviceHref}
					className="rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-400">
					Add trusted device
				</Link>
				<button
					onClick={verify}
					className="rounded-xl border border-white/20 px-4 py-3 text-sm font-bold text-white transition hover:border-red-400 hover:text-red-300">
					Verify with passkey
				</button>
			</div>

			{status ? <p className="mt-4 text-sm text-slate-200">{status}</p> : null}
			{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

			<div className="mt-6 grid gap-4">
				{devices.map((device, index) => (
					<article
						key={device.id}
						className="rounded-2xl border border-white/10 bg-slate-950/90 p-5">
						<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
							<div>
								<h2 className="text-lg font-black">
									Trusted Device #{index + 1}: {device.deviceName}
								</h2>
								<p className="mt-2 text-sm text-slate-300">
									Last used: {formatDate(device.lastUsedAt)}
								</p>
								<p className="mt-1 text-sm text-slate-400">
									Added: {formatDate(device.createdAt)}
								</p>
								<p className="mt-3 max-w-3xl break-words text-xs text-slate-500">
									{device.userAgent}
								</p>
							</div>
							<button
								onClick={() => removeDevice(device.id)}
								className="rounded-xl border border-red-500/50 px-4 py-2 text-sm font-bold text-red-200 transition hover:bg-red-500 hover:text-white">
								Remove
							</button>
						</div>
					</article>
				))}
			</div>
		</div>
	);
}

export { DevicesPanel };
