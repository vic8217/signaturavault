'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { reverifyPasskey } from '@/lib/passkey-client';
import {
	resolveDeviceVaultTenantId,
	unlockHoaKeyFromDeviceVault,
} from '@/lib/hoaKeyDeviceVault';
import { wrapHoaKeyForBrowser } from '@/lib/remoteUnlockCrypto';

function bufferToHex(buffer) {
	return Array.from(new Uint8Array(buffer))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

async function sha256Hex(value) {
	const input = new TextEncoder().encode(value);
	return bufferToHex(await crypto.subtle.digest('SHA-256', input));
}

function formatExpiry(value) {
	if (!value) return '';
	try {
		return new Date(value).toLocaleTimeString();
	} catch {
		return '';
	}
}

export function HoaKeyRemoteUnlockForm({
	challengeId,
	shortCode,
	homeHref = '/signatura/dashboard',
}) {
	const [challenge, setChallenge] = useState(null);
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');
	const [isLoading, setIsLoading] = useState(true);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [approved, setApproved] = useState(false);
	const [vaultTenantId, setVaultTenantId] = useState(null);
	const normalizedCode = useMemo(() => String(shortCode || '').trim().toUpperCase(), [shortCode]);

	function setupHrefForChallenge(activeChallenge) {
		if (!activeChallenge?.hoaId) return '/hoa-key/setup';
		const returnTo = new URL('/hoa-key/remote-unlock', window.location.origin);
		returnTo.searchParams.set('cid', challengeId);
		returnTo.searchParams.set('code', normalizedCode);
		const setup = new URL('/hoa-key/setup', window.location.origin);
		setup.searchParams.set('tenantId', activeChallenge.hoaId);
		setup.searchParams.set('hoaId', activeChallenge.hoaId);
		setup.searchParams.set('returnTo', returnTo.toString());
		return setup.toString();
	}

	useEffect(() => {
		let cancelled = false;
		async function loadChallenge() {
			setIsLoading(true);
			setError('');
			try {
				const response = await fetch(
					`/api/hoa-key/remote-unlock/lookup?cid=${encodeURIComponent(challengeId)}&code=${encodeURIComponent(normalizedCode)}`,
					{ cache: 'no-store' },
				);
				const body = await response.json().catch(() => ({}));
				if (!response.ok || body?.ok === false) {
					throw new Error(body?.error || 'Unlock challenge not found or expired.');
				}
				if (!cancelled) {
					setChallenge(body.challenge);
					setVaultTenantId(
						resolveDeviceVaultTenantId(
							body.challenge?.hoaId,
							body.challenge?.keyRef,
						),
					);
				}
			} catch (loadError) {
				if (!cancelled) {
					setError(
						loadError instanceof Error
							? loadError.message
							: 'Unable to load unlock challenge.',
					);
				}
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		}
		if (challengeId && normalizedCode) loadChallenge();
		return () => {
			cancelled = true;
		};
	}, [challengeId, normalizedCode]);

	async function approveUnlock() {
		if (!challenge) return;
		setIsSubmitting(true);
		setError('');
		setStatus('Verify with passkey or biometric on this trusted device.');
		try {
			const reauth = await reverifyPasskey();
			const credentialId = reauth.credentialId;
			if (!credentialId) throw new Error('Trusted device credential was not returned.');

			const vaultId = resolveDeviceVaultTenantId(challenge.hoaId, challenge.keyRef);
			if (!vaultId) {
				throw new Error(
					'This device does not have the current HOA encryption key. Set up or import the enrolled key on this phone, then return here to approve.',
				);
			}

			setStatus('Unlocking HOA key from this trusted device...');
			const hoaKey = await unlockHoaKeyFromDeviceVault({
				tenantId: vaultId,
				credentialId,
				keyRef: challenge.keyRef,
			});
			const unlockProof = await sha256Hex(hoaKey);
			const wrappedKeyPayload = await wrapHoaKeyForBrowser(
				hoaKey,
				challenge.browserPublicKey,
			);

			setStatus('Authorizing release for the browser session...');
			const response = await fetch('/api/hoa-key/remote-unlock/approve', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					challengeId: challenge.id,
					shortCode: normalizedCode,
					credentialId,
					unlockProof,
					wrappedKeyPayload,
				}),
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok || body?.ok === false) {
				throw new Error(body?.error || 'Remote unlock approval failed.');
			}

			setApproved(true);
			setVaultTenantId(vaultId);
			setStatus('Browser session authorized. You can return to HavenxSig on your computer.');
		} catch (approveError) {
			const message =
				approveError instanceof Error
					? approveError.message
					: 'Unable to approve remote unlock.';
			setError(message);
			setStatus('');
			if (
				/authorization proof rejected|does not match the enrolled key|out of date for this hoa/i.test(
					message,
				)
			) {
				setError(
					'The HOA encryption key on this phone does not match the key enrolled for this HOA. Open HOA key setup on this phone, choose Import existing key, paste the same key you saved when enrolling, then scan the QR again.',
				);
			} else if (/different passkey/i.test(message)) {
				setError(message);
			} else if (/signatura identity does not match/i.test(message)) {
				setError(
					`${message} Use the same Signatura account (SIG-…) on your phone as on the HavenxSig browser.`,
				);
			}
		} finally {
			setIsSubmitting(false);
		}
	}

	if (isLoading) {
		return <p className="text-sm text-slate-300">Loading unlock challenge...</p>;
	}

	if (error && !challenge) {
		return (
			<section className="mx-auto max-w-3xl rounded-2xl border border-red-500/20 bg-slate-950/90 p-6 shadow-2xl">
				<p className="text-sm text-red-300">{error}</p>
				<p className="mt-3 text-sm text-slate-400">
					The QR code may have expired (about 5 minutes). Start a new unlock on your computer.
				</p>
				<div className="mt-6 flex flex-wrap gap-3">
					<Link
						href="/hoa-key/remote-unlock"
						className="inline-flex h-10 items-center rounded-lg border border-white/15 px-4 text-xs font-bold text-white transition hover:bg-white/5">
						Scan new QR
					</Link>
					<Link
						href={homeHref}
						className="inline-flex h-10 items-center rounded-lg bg-red-500 px-4 text-xs font-bold text-white transition hover:bg-red-400">
						Back to Signatura
					</Link>
				</div>
			</section>
		);
	}

	return (
		<section className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl">
			<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">Remote unlock</p>
			<h1 className="mt-2 text-3xl font-black">Authorize browser session</h1>
			<p className="mt-3 text-sm leading-6 text-slate-300">
				Approve release of the HOA encryption key for a short-lived HavenxSig browser session.
				Your raw key is wrapped for that browser only and is never sent to the server.
			</p>

			<div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
				<p>
					<span className="font-semibold text-white">HOA:</span>{' '}
					{challenge?.hoaName || challenge?.hoaId}
				</p>
				<p className="mt-2">
					<span className="font-semibold text-white">Short code:</span>{' '}
					<span className="font-mono tracking-[0.25em]">{normalizedCode}</span>
				</p>
				{challenge?.expiresAt ? (
					<p className="mt-2 text-xs text-slate-400">
						Challenge expires at {formatExpiry(challenge.expiresAt)}.
					</p>
				) : null}
			</div>

			{approved ? (
				<p className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
					{status}
				</p>
			) : vaultTenantId ? (
				<button
					type="button"
					onClick={approveUnlock}
					disabled={isSubmitting || !challenge}
					className="mt-6 w-full rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
					{isSubmitting ? 'Authorizing...' : 'Approve with passkey'}
				</button>
			) : (
				<div className="mt-6 space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
					<p className="text-sm text-amber-50">
						This phone does not have the current HOA encryption key for this unlock request.
						Enroll on this phone (or import the saved key from enrollment), then return here to
						approve.
					</p>
					{challenge?.keyRef ? (
						<p className="text-xs text-amber-100/80">
							Required key reference:{' '}
							<span className="font-mono">{challenge.keyRef}</span>
						</p>
					) : null}
					<Link
						href={challenge ? setupHrefForChallenge(challenge) : '/hoa-key/setup'}
						className="inline-flex w-full items-center justify-center rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
						Set up HOA key on this phone
					</Link>
				</div>
			)}

			{status && !approved ? <p className="mt-4 text-sm text-slate-200">{status}</p> : null}
			{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
		</section>
	);
}
