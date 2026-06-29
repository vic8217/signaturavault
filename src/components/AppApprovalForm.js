'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { signaturaApiRequest } from '@/lib/registration-api-client';

export function AppApprovalForm({
	challengeId,
	app,
	requestedRole,
	flowType,
	callbackUrl,
	signaturaId,
}) {
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');
	const [isApproving, setIsApproving] = useState(false);
	const [approved, setApproved] = useState(false);

	async function approve() {
		if (isApproving || !challengeId || !signaturaId) return;
		setIsApproving(true);
		setError('');
		setStatus('Approving request...');
		try {
			const { response, data } = await signaturaApiRequest(
				'/api/signatura/app-approval/approve',
				{
					method: 'POST',
					body: JSON.stringify({
						challengeId,
						app,
						requestedRole,
						flowType,
						callbackUrl,
					}),
				},
				'Signatura app approval',
			);
			if (!response.ok) {
				throw new Error(data?.error || 'Unable to approve request.');
			}
			setApproved(true);
			setStatus(`Approved. Return to your ${app} browser.`);
		} catch (approvalError) {
			setStatus('');
			setError(
				approvalError instanceof Error
					? approvalError.message
					: 'Unable to approve request.',
			);
		} finally {
			setIsApproving(false);
		}
	}

	if (approved) {
		return (
			<section className="mx-auto w-full max-w-2xl rounded-2xl border border-emerald-400/30 bg-slate-950/90 p-6 text-white shadow-2xl">
				<div className="flex items-center gap-4">
					<span className="grid h-12 w-12 place-items-center text-emerald-300">
						<ShieldCheck className="h-8 w-8" aria-hidden="true" />
					</span>
					<div>
						<p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-200">
							{app} approval
						</p>
						<h1 className="mt-1 text-2xl font-black">
							Approved. Return to your {app} browser.
						</h1>
					</div>
				</div>
			</section>
		);
	}

	return (
		<section className="mx-auto w-full max-w-2xl rounded-2xl border border-red-500/30 bg-slate-950/90 p-6 text-white shadow-2xl">
			<div className="flex items-center gap-4">
				<span className="grid h-12 w-12 place-items-center text-red-400">
					<ShieldCheck className="h-8 w-8" aria-hidden="true" />
				</span>
				<div>
					<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
						Authorization request
					</p>
					<h1 className="mt-1 text-2xl font-black">Existing Signatura Identity Found</h1>
				</div>
			</div>

			<div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
				<p>
					Universal ID: <span className="font-mono text-white">{signaturaId}</span>
				</p>
				<p>
					Application: <span className="font-mono text-white">{app}</span>
				</p>
				<p>
					Requested Role:{' '}
					<span className="font-mono text-white">{requestedRole}</span>
				</p>
			</div>

			<div className="mt-6 grid gap-3 sm:grid-cols-2">
				<button
					type="button"
					onClick={approve}
					disabled={isApproving}
					className="rounded-lg bg-red-500 px-5 py-4 text-base font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
					{isApproving ? 'Approving...' : 'Approve'}
				</button>
				<Link
					href="/signatura/dashboard"
					className="rounded-lg border border-white/15 px-5 py-4 text-center text-base font-bold text-slate-100 transition hover:border-red-300 hover:text-white">
					Cancel
				</Link>
			</div>

			{status ? (
				<p className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-200">
					{status}
				</p>
			) : null}
			{error ? (
				<p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
					{error}
				</p>
			) : null}
		</section>
	);
}
