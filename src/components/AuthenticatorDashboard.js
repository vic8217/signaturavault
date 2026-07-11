'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { readDeviceBindingSecret } from '@/lib/trustedDeviceBindingClient';
import { reverifyPasskey } from '@/lib/passkey-client';

export function AuthenticatorDashboard({ signaturaId }) {
	const searchParams = useSearchParams();
	const challengeToken = searchParams.get('challenge') || '';
	const [applications, setApplications] = useState([]);
	const [approved, setApproved] = useState([]);
	const [revealed, setRevealed] = useState({});
	const [now, setNow] = useState(0);
	const [error, setError] = useState('');
	const binding = useCallback(() => readDeviceBindingSecret(signaturaId), [signaturaId]);

	const load = useCallback(async () => {
		const response = await fetch('/api/authenticator/applications', { headers: { 'x-device-binding': binding() }, cache: 'no-store' });
		const data = await response.json();
		if (!response.ok) throw new Error(data.error);
		setApplications(data.applications || []);
		setApproved(data.approved || []);
	}, [binding]);

	useEffect(() => {
		const timer = setTimeout(() => load().catch((cause) => setError(cause.message)), 0);
		return () => clearTimeout(timer);
	}, [load]);

	async function enroll(applicationId) {
		setError('');
		let response = await fetch('/api/authenticator/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationId, deviceBindingSecret: binding() }) });
		if (response.status === 428) {
			await reverifyPasskey();
			response = await fetch('/api/authenticator/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationId, deviceBindingSecret: binding() }) });
		}
		const data = await response.json();
		if (!response.ok) throw new Error(data.error);
		await load();
	}

	const reveal = useCallback(async (application) => {
		let response = await fetch('/api/authenticator/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationId: application.applicationId, deviceBindingSecret: binding(), challengeToken }), cache: 'no-store' });
		if (response.status === 428) {
			await reverifyPasskey();
			response = await fetch('/api/authenticator/code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationId: application.applicationId, deviceBindingSecret: binding(), challengeToken }), cache: 'no-store' });
		}
		const data = await response.json();
		if (!response.ok) throw new Error(data.error);
		setRevealed((current) => ({ ...current, [application.applicationId]: { ...data, deadline: Date.now() + data.expiresIn * 1000 } }));
	}, [binding, challengeToken]);

	useEffect(() => {
		const timer = setInterval(() => {
			const timestamp = Date.now();
			setNow(timestamp);
			for (const application of applications) {
				const item = revealed[application.applicationId];
				if (item && item.deadline <= timestamp) reveal(application).catch((cause) => setError(cause.message));
			}
		}, 1000);
		return () => clearInterval(timer);
	}, [applications, reveal, revealed]);

	return <div className="space-y-6">
		<section className="rounded-2xl border border-white/10 bg-white/4 p-6"><p className="text-sm font-bold uppercase tracking-[0.2em] text-red-400">Security</p><h1 className="mt-2 text-3xl font-black text-white">Authenticator</h1><p className="mt-3 text-sm text-slate-300">Temporary codes prove identity ownership only. Application roles and permissions remain with each application.</p></section>
		{error ? <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</p> : null}
		<section><h2 className="mb-3 text-lg font-bold text-white">Registered Applications</h2><div className="grid gap-4">
			{applications.map((application) => { const item = revealed[application.applicationId]; const remaining = item ? Math.max(0, Math.ceil((item.deadline - now) / 1000)) : 0; return <article key={application.applicationId} className="rounded-2xl border border-white/10 bg-slate-950/80 p-5"><div className="flex items-start justify-between"><div><h3 className="text-xl font-black text-white">{application.name}</h3><p className="mt-1 text-sm text-emerald-300">Status: Active</p></div>{application.requireBiometric ? <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-200">Biometric required</span> : null}</div>{item ? <div className="mt-6"><p className="font-mono text-4xl font-black tracking-[0.2em] text-white">{item.code.slice(0,3)} {item.code.slice(3)}</p><p className="mt-3 text-sm text-slate-300">Expires in {remaining} seconds</p><p className="mt-1 text-xs text-slate-500">Last Generated {new Date(item.generatedAt).toLocaleTimeString()}</p></div> : <button onClick={() => reveal(application).catch((cause) => setError(cause.message))} className="mt-5 rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white hover:bg-red-400">Generate Code</button>}</article>; })}
			{applications.length === 0 ? <p className="rounded-xl border border-white/10 p-5 text-sm text-slate-400">No applications enrolled on this identity.</p> : null}
		</div></section>
		{approved.filter((candidate) => !applications.some((item) => item.applicationId === candidate.applicationId)).length ? <section><h2 className="mb-3 text-lg font-bold text-white">Approved Applications</h2>{approved.filter((candidate) => !applications.some((item) => item.applicationId === candidate.applicationId)).map((application) => <button key={application.applicationId} onClick={() => enroll(application.applicationId).catch((cause) => setError(cause.message))} className="w-full rounded-2xl border border-white/10 bg-white/4 p-5 text-left hover:border-red-400"><span className="font-bold text-white">{application.name}</span><span className="float-right text-sm text-red-300">Enroll</span></button>)}</section> : null}
	</div>;
}
