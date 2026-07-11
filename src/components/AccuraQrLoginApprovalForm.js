'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
	browserSupportsWebAuthn,
	startAuthentication,
} from '@simplewebauthn/browser';
import { useEffect, useMemo, useState } from 'react';
import {
	readSignaturaApiJson,
	signaturaApiFetch,
	signaturaApiRequest,
} from '@/lib/registration-api-client';

function formatExpiry(value) {
	if (!value) return 'about 90 seconds';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return 'about 90 seconds';
	return date.toLocaleTimeString();
}

export function AccuraQrLoginApprovalForm({ challengeId, shortCode }) {
	const router = useRouter();
	const [challenge, setChallenge] = useState(null);
	const [accounts, setAccounts] = useState([]);
	const [currentAccount, setCurrentAccount] = useState(null);
	const [selectedAccountId, setSelectedAccountId] = useState('');
	const [status, setStatus] = useState('Pending approval');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [approved, setApproved] = useState(false);
	const normalizedShortCode = useMemo(
		() => String(shortCode || '').trim().toUpperCase(),
		[shortCode],
	);
	useEffect(() => {
		let cancelled = false;
		async function load() {
			setLoading(true);
			setError('');
			try {
				const response = await signaturaApiFetch(
					`/api/signatura/accura/qr-login/challenge?challengeId=${encodeURIComponent(challengeId)}&shortCode=${encodeURIComponent(normalizedShortCode)}`,
					{ cache: 'no-store' },
				);
				const body = await readSignaturaApiJson(
					response,
					'ACCURA login challenge',
				);
				if (!response.ok || !body?.ok) {
					throw new Error(body?.error || 'Unable to load ACCURA login request.');
				}
				if (!cancelled) {
					setChallenge(body.challenge);
					setAccounts(body.accounts || []);
					setCurrentAccount(body.currentAccount || null);
					if (body.accounts?.length === 1) {
						setSelectedAccountId(body.accounts[0].id);
					}
				}
			} catch (loadError) {
				if (!cancelled) {
					const message =
						loadError instanceof Error
							? loadError.message
							: 'Unable to load ACCURA login request.';
					setError(message);
					setStatus(message.includes('expired') ? 'Expired' : 'Failed');
					if (message.includes('expired')) {
						void signaturaApiRequest(
							'/api/signatura/accura/qr-login/audit',
							{
								method: 'POST',
								body: JSON.stringify({
									event: 'accura_qr_expired_attempt',
									challengeId,
								}),
							},
							'ACCURA QR audit',
						).catch(() => null);
					}
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		}
		if (challengeId && normalizedShortCode) void load();
		return () => {
			cancelled = true;
		};
	}, [challengeId, normalizedShortCode]);

	async function approve() {
		if (!selectedAccountId) {
			setError('Choose an ACCURA account before approving login.');
			return;
		}
		if (!browserSupportsWebAuthn()) {
			setError('This browser does not support passkeys.');
			return;
		}

		setSubmitting(true);
		setError('');
		setStatus('Waiting for passkey or biometric approval');
		try {
			const { response: startResponse, data: startData } =
				await signaturaApiRequest(
					'/api/signatura/accura/qr-login/start',
					{
						method: 'POST',
						body: JSON.stringify({
							challengeId,
							shortCode: normalizedShortCode,
							walletAccountId: selectedAccountId,
						}),
					},
					'ACCURA login approval',
				);
			if (!startResponse.ok || !startData?.options) {
				throw new Error(startData?.error || 'Unable to start passkey approval.');
			}

			const assertion = await startAuthentication({
				optionsJSON: startData.options,
			});
			setStatus('Sending approval to ACCURA');
			const { response, data } = await signaturaApiRequest(
				'/api/signatura/accura/qr-login/approve',
				{
					method: 'POST',
					body: JSON.stringify({
						challengeId,
						shortCode: normalizedShortCode,
						walletAccountId: selectedAccountId,
						response: assertion,
					}),
				},
				'ACCURA login approval',
			);
			if (!response.ok || !data?.ok) {
				throw new Error(data?.error || 'ACCURA login approval failed.');
			}
			setApproved(true);
			setStatus('Approved');
			router.replace('/owner/wallet');
		} catch (approveError) {
			setError(
				approveError instanceof Error
					? approveError.message
					: 'ACCURA login approval failed.',
			);
			setStatus('Failed');
		} finally {
			setSubmitting(false);
		}
	}

	async function cancel() {
		setSubmitting(true);
		setError('');
		try {
			const { response, data } = await signaturaApiRequest(
				'/api/signatura/accura/qr-login/cancel',
				{
					method: 'POST',
					body: JSON.stringify({
						challengeId,
						shortCode: normalizedShortCode,
					}),
				},
				'ACCURA login cancellation',
			);
			if (!response.ok) throw new Error(data?.error || 'Unable to cancel login.');
			setStatus('Cancelled');
		} catch (cancelError) {
			setError(
				cancelError instanceof Error
					? cancelError.message
					: 'Unable to cancel login.',
			);
			setStatus('Failed');
		} finally {
			setSubmitting(false);
		}
	}

	if (loading) {
		return <p className="text-sm text-slate-300">Loading ACCURA login request...</p>;
	}

	return (
		<section className="rounded-2xl border border-white/10 bg-slate-950/90 p-6 text-white shadow-2xl">
			<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
				{status}
			</p>
			<h1 className="mt-2 text-3xl font-black">ACCURA Login Request</h1>
			<p className="mt-3 text-sm leading-6 text-slate-300">
				Approve this request with your Signatura identity and the required
				ACCURA role.
			</p>
			{currentAccount?.signaturaId ? (
				<div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-50">
					<p>
						Signatura identity:{' '}
						<span className="font-mono font-bold text-white">
							{currentAccount.signaturaId}
						</span>
					</p>
					<p className="mt-2 text-xs leading-5 text-emerald-100/80">
						All authorized ACCURA roles linked to this identity use the same
						biometric/passkey.
					</p>
				</div>
			) : null}

			{challenge ? (
				<div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
					<p><span className="font-semibold">App:</span> ACCURA</p>
					<p className="mt-2">
						<span className="font-semibold">Browser:</span> {challenge.browser}
					</p>
					<p className="mt-2">
						<span className="font-semibold">Expires:</span>{' '}
						{formatExpiry(challenge.expiresAt)}
					</p>
					{challenge.expectedRolePrefix ? (
						<p className="mt-2">
							<span className="font-semibold">Required account:</span>{' '}
							{challenge.expectedRolePrefix}
						</p>
					) : null}
					{challenge.expectedSignaturaId ? (
						<p className="mt-2 break-all">
							<span className="font-semibold">Required Signatura ID:</span>{' '}
							<span className="font-mono">{challenge.expectedSignaturaId}</span>
						</p>
					) : null}
				</div>
			) : null}

			{accounts.length ? (
				<fieldset className="mt-6 grid gap-3">
					<legend className="mb-2 text-sm font-bold">Choose ACCURA Role</legend>
					{accounts.map((account) => (
						<label
							key={account.id}
							className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${
								selectedAccountId === account.id
									? 'border-red-400 bg-red-500/10'
									: 'border-white/10 bg-white/5'
							}`}>
							<input
								type="radio"
								name="accuraAccount"
								value={account.id}
								checked={selectedAccountId === account.id}
								onChange={() => setSelectedAccountId(account.id)}
								disabled={!account.active}
							/>
							<span className="min-w-0">
								<span className="block text-sm font-bold text-white">
									{account.displayName}
								</span>
								<span className="mt-1 block break-all font-mono text-xs text-slate-400">
									{account.signaturaId}
								</span>
							</span>
						</label>
					))}
				</fieldset>
			) : null}

			{approved ? (
				<p className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
					Login approved. You may return to ACCURA.
				</p>
			) : null}
			{error ? (
				<p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
					{error}
				</p>
			) : null}

			<div className="mt-6 grid gap-3 sm:grid-cols-2">
				{!approved && status !== 'Cancelled' ? (
					<button
						type="button"
						onClick={approve}
						disabled={submitting || !challenge || !selectedAccountId}
						className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
						{submitting ? 'Please wait...' : 'Approve with Passkey'}
					</button>
				) : null}
				{!approved && status !== 'Cancelled' ? (
					<button
						type="button"
						onClick={cancel}
						disabled={submitting}
						className="rounded-xl border border-white/15 px-5 py-3 text-sm font-bold transition hover:border-red-300">
						Cancel Login
					</button>
				) : (
					<Link
						href="/signatura/dashboard"
						className="rounded-xl border border-white/15 px-5 py-3 text-center text-sm font-bold transition hover:border-red-300">
						Return to Wallet
					</Link>
				)}
			</div>
		</section>
	);
}
