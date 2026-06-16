'use client';

import Link from 'next/link';
import {
	browserSupportsWebAuthn,
	startAuthentication,
} from '@simplewebauthn/browser';
import { useEffect, useMemo, useState } from 'react';

function formatExpiry(value) {
	if (!value) return '';
	try {
		return new Date(value).toLocaleTimeString();
	} catch {
		return '';
	}
}

export function LoginRemoteApproveForm({
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
	const [approvalOptions, setApprovalOptions] = useState(null);
	const normalizedCode = useMemo(
		() => String(shortCode || '').trim().toUpperCase(),
		[shortCode],
	);

	useEffect(() => {
		let cancelled = false;
		async function loadChallenge() {
			setIsLoading(true);
			setError('');
			try {
				const response = await fetch(
					`/api/auth/login/remote/lookup?cid=${encodeURIComponent(challengeId)}&code=${encodeURIComponent(normalizedCode)}`,
					{ cache: 'no-store' },
				);
				const body = await response.json().catch(() => ({}));
				if (!response.ok || body?.ok === false) {
					throw new Error(body?.error || 'Login challenge not found or expired.');
				}
				if (!cancelled) {
					setChallenge(body.challenge);
					setApprovalOptions(body.options);
				}
			} catch (loadError) {
				if (!cancelled) {
					setError(
						loadError instanceof Error
							? loadError.message
							: 'Unable to load login challenge.',
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

	async function approveLogin() {
		if (!challenge) return;
		setIsSubmitting(true);
		setError('');
		setStatus('Verify this QR login with passkey or biometric.');
		try {
			if (!browserSupportsWebAuthn()) {
				throw new Error('This browser does not support passkeys/WebAuthn.');
			}
			if (!approvalOptions) {
				throw new Error('QR approval challenge is missing or expired.');
			}
			const assertion = await startAuthentication({
				optionsJSON: approvalOptions,
			});

			setStatus('Approving browser sign-in...');
			const response = await fetch('/api/auth/login/remote/approve', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					challengeId: challenge.id,
					shortCode: normalizedCode,
					response: assertion,
				}),
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok || body?.ok === false) {
				throw new Error(body?.error || 'Trusted device login approval failed.');
			}

			setApproved(true);
			setStatus(
				'Browser sign-in approved. You can return to the other device; it should sign in automatically.',
			);
		} catch (approveError) {
			setError(
				approveError instanceof Error
					? approveError.message
					: 'Unable to approve browser sign-in.',
			);
			setStatus('');
		} finally {
			setIsSubmitting(false);
		}
	}

	if (isLoading) {
		return <p className="text-sm text-slate-300">Loading login challenge...</p>;
	}

	if (error && !challenge) {
		return (
			<section className="mx-auto max-w-3xl rounded-2xl border border-red-500/20 bg-slate-950/90 p-6 shadow-2xl">
				<p className="text-sm text-red-300">{error}</p>
				<p className="mt-3 text-sm text-slate-400">
					The QR code may have expired. Start a new trusted-device login on the
					browser.
				</p>
				<div className="mt-6 flex flex-wrap gap-3">
					<Link
						href="/login/remote-approve/scan"
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
			<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
				Trusted device login
			</p>
			<h1 className="mt-2 text-3xl font-black">Approve browser sign-in</h1>
			<p className="mt-3 text-sm leading-6 text-slate-300">
				Another browser is requesting access to Signatura. Verify with your passkey
				on this trusted device to approve the session.
			</p>

			<div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
				<p>
					<span className="font-semibold text-white">Signatura ID:</span>{' '}
					{challenge?.signaturaId}
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
			) : (
				<button
					type="button"
					onClick={approveLogin}
					disabled={isSubmitting || !challenge}
					className="mt-6 w-full rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
					{isSubmitting ? 'Approving...' : 'Approve with passkey'}
				</button>
			)}

			{status && !approved ? (
				<p className="mt-4 text-sm text-slate-200">{status}</p>
			) : null}
			{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
		</section>
	);
}
