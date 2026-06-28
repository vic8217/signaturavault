'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
import { signaturaApiRequest } from '@/lib/registration-api-client';
import { storeTrustedDeviceSignaturaId } from '@/lib/trustedDeviceLoginClient';
import { isPhoneUnreachableAccuraReturnUrl } from '@/lib/externalReturnUrl';

function isMobileRegistrationClient() {
	if (typeof window === 'undefined') return false;
	return /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent || '');
}

export function AccuraOnboardingLinkForm({
	accuraHandoffToken = '',
	appRegistrationContext = {},
}) {
	const signaturaId = String(appRegistrationContext.linkSignaturaId || '').trim();
	const companyCode = appRegistrationContext.companyCode || '';
	const companyName = appRegistrationContext.companyName || companyCode || 'ACCURA';
	const rolePrefix = appRegistrationContext.rolePrefix || '';
	const roleName = appRegistrationContext.role || appRegistrationContext.roleName || '';
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const requestedRole =
		rolePrefix === 'SADM'
			? 'SYSTEM_ADMIN'
			: rolePrefix === 'CADM'
				? 'COMPANY_ADMIN'
				: String(roleName || rolePrefix || 'STAFF')
						.trim()
						.toUpperCase()
						.replace(/[^A-Z0-9]+/g, '_')
						.replace(/^_|_$/g, '');

	async function linkWithPasskey() {
		if (!signaturaId || isSubmitting) return;
		setError('');
		setIsSubmitting(true);
		setStatus('Preparing trusted-device approval...');

		try {
			const { response: startResponse, data: startData } = await signaturaApiRequest(
				'/api/auth/login/start',
				{
					method: 'POST',
					body: JSON.stringify({ signaturaId }),
				},
				'Passkey link start',
			);
			if (!startResponse.ok) {
				throw new Error(startData?.error || 'Unable to start passkey approval.');
			}

			setStatus('Approve linking with your trusted device passkey.');
			const assertion = await startAuthentication({
				optionsJSON: startData.options,
			});

			const { response: linkResponse, data: linkData } = await signaturaApiRequest(
				'/api/auth/register/accura/link',
				{
					method: 'POST',
					body: JSON.stringify({
						accuraHandoffToken,
						signaturaId,
						userId: startData.userId,
						response: assertion,
					}),
				},
				'ACCURA Signatura link',
			);
			if (!linkResponse.ok) {
				throw new Error(linkData?.error || 'Unable to link Signatura ID to ACCURA.');
			}

			storeTrustedDeviceSignaturaId(signaturaId);
			const destination = linkData.accuraReturnUrl || linkData.redirectTo || '/';
			if (isPhoneUnreachableAccuraReturnUrl(destination) && isMobileRegistrationClient()) {
				setStatus(
					'Signatura ID linked. Return to ACCURA on your computer — registration will continue automatically.',
				);
				return;
			}
			setStatus('Signatura ID linked. Returning to ACCURA...');
			window.location.href = destination;
		} catch (linkError) {
			setError(
				linkError instanceof Error
					? linkError.message
					: 'Unable to link Signatura ID to ACCURA.',
			);
			setStatus('');
		} finally {
			setIsSubmitting(false);
		}
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
			<p className="mt-4 text-sm leading-6 text-slate-300">
				Approve this request to attach the ACCURA authorization to your Universal
				Signatura ID. No new identity will be created.
			</p>
			<div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
				<p>
					Universal ID:{' '}
					<span className="font-mono text-white">{signaturaId || 'Not available'}</span>
				</p>
				<p>
					Application: <span className="font-mono text-white">ACCURA</span>
				</p>
				<p>
					Company: <span className="font-mono text-white">{companyName}</span>
				</p>
				<p>
					Requested Role:{' '}
					<span className="font-mono text-white">{requestedRole || 'STAFF'}</span>
				</p>
			</div>
			<div className="mt-6 grid gap-3 sm:grid-cols-2">
				<button
					type="button"
					onClick={linkWithPasskey}
					disabled={isSubmitting || !signaturaId}
					className="rounded-lg bg-red-500 px-5 py-4 text-base font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
					{isSubmitting ? 'Waiting for passkey...' : 'Approve'}
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
