'use client';

import Link from 'next/link';
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
import { readDeviceBindingSecret } from '@/lib/trustedDeviceBindingClient';

function formatExpiry(value) {
	if (!value) return '';
	try {
		return new Date(value).toLocaleTimeString();
	} catch {
		return '';
	}
}

function appLabelForChallenge(challenge) {
	if (challenge?.sourceApp === 'SIGNATURA_ADMIN') return 'Signatura Admin Portal';
	if (challenge?.sourceApp === 'SIGNATURA_ISSUER') return 'Signatura Issuer Portal';
	if (challenge?.sourceApp === 'ACCURA') return 'ACCURA';
	if (challenge?.sourceApp === 'HAVEN') return 'HAVEN';
	return 'Signatura';
}

function isAdminQr(challenge) {
	return challenge?.sourceApp === 'SIGNATURA_ADMIN';
}

function isIssuerQr(challenge) {
	return challenge?.sourceApp === 'SIGNATURA_ISSUER';
}

function formatCountdown(expiresAt) {
	if (!expiresAt) return '';
	const remaining = Math.max(0, new Date(expiresAt).getTime() - Date.now());
	const minutes = Math.floor(remaining / 60000);
	const seconds = Math.floor((remaining % 60000) / 1000);
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function LoginRemoteApproveForm({
	challengeId,
	shortCode,
	homeHref = '/signatura/dashboard',
	expectedSignaturaId = '',
}) {
	const [challenge, setChallenge] = useState(null);
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');
	const [isLoading, setIsLoading] = useState(true);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [approved, setApproved] = useState(false);
	const [approvalOptions, setApprovalOptions] = useState(null);
	const [countdown, setCountdown] = useState('');
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
				const deviceBindingSecret = readDeviceBindingSecret(expectedSignaturaId);
				if (!deviceBindingSecret) {
					throw new Error(
						'This phone is not registered for QR approval. Register it as a trusted device first.',
					);
				}
				const response = await signaturaApiFetch(
					`/api/auth/login/remote/lookup?cid=${encodeURIComponent(challengeId)}&code=${encodeURIComponent(normalizedCode)}&deviceBindingSecret=${encodeURIComponent(deviceBindingSecret)}`,
					{ cache: 'no-store' },
				);
				const body = await readSignaturaApiJson(response, 'Login challenge lookup');
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
	}, [challengeId, normalizedCode, expectedSignaturaId]);

	useEffect(() => {
		if (!challenge?.expiresAt) return;
		const initialTimer = window.setTimeout(() => {
			setCountdown(formatCountdown(challenge.expiresAt));
		}, 0);
		const timer = window.setInterval(() => {
			setCountdown(formatCountdown(challenge.expiresAt));
		}, 1000);
		return () => {
			window.clearTimeout(initialTimer);
			window.clearInterval(timer);
		};
	}, [challenge?.expiresAt]);

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
			const deviceBindingSecret = readDeviceBindingSecret(challenge.signaturaId);
			if (!deviceBindingSecret) {
				throw new Error(
					'This phone is not registered for QR approval. Register it as a trusted device first.',
				);
			}
			const assertion = await startAuthentication({
				optionsJSON: approvalOptions,
			});

			setStatus('Approving browser sign-in...');
			const { response, data: body } = await signaturaApiRequest(
				'/api/auth/login/remote/approve',
				{
					method: 'POST',
					body: JSON.stringify({
						challengeId: challenge.id,
						shortCode: normalizedCode,
						deviceBindingSecret,
						response: assertion,
					}),
				},
				'Trusted device login approval',
			);
			if (!response.ok || body?.ok === false) {
				throw new Error(body?.error || 'Trusted device login approval failed.');
			}

			setApproved(true);
			setStatus(
				isAdminQr(challenge)
					? 'Admin sign-in approved. You may return to your desktop.'
					: isIssuerQr(challenge)
						? 'Issuer portal sign-in approved. You may return to your desktop.'
					: 'Browser sign-in approved. You can return to the other device; it should sign in automatically.',
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
		const mismatch =
			error.includes('does not match the browser login request') ||
			error.includes('different Signatura ID');
		return (
			<section className="mx-auto max-w-3xl rounded-2xl border border-red-500/20 bg-slate-950/90 p-6 shadow-2xl">
				<p className="text-sm text-red-300">{error}</p>
				{mismatch && expectedSignaturaId ? (
					<p className="mt-3 text-sm text-slate-300">
						Sign in on this phone as{' '}
						<span className="font-mono text-white">{expectedSignaturaId}</span>, then
						scan the QR code again.
					</p>
				) : (
					<p className="mt-3 text-sm text-slate-400">
						The QR code may have expired. Start a new trusted-device login on the
						browser.
					</p>
				)}
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
				{isAdminQr(challenge)
					? 'Admin QR sign-in'
					: isIssuerQr(challenge)
						? 'Issuer QR sign-in'
					: 'Trusted device login'}
			</p>
			<h1 className="mt-2 text-3xl font-black">
				{isAdminQr(challenge)
					? 'Approve Admin Sign-in'
					: isIssuerQr(challenge)
						? 'Approve Issuer Sign-in'
					: 'Approve browser sign-in'}
			</h1>
			<p className="mt-3 text-sm leading-6 text-slate-300">
				{isAdminQr(challenge)
					? 'Signatura Admin Portal is requesting access. Verify with your passkey on this trusted device to approve the desktop session.'
					: isIssuerQr(challenge)
						? 'Signatura Issuer Portal is requesting access. Verify with your passkey on this trusted device to approve the desktop session.'
					: 'Another browser is requesting access to Signatura. Verify with your passkey on this trusted device to approve the session.'}
			</p>
			{expectedSignaturaId ? (
				<p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-50">
					This approval must be completed while signed in as{' '}
					<span className="font-mono text-white">{expectedSignaturaId}</span>.
				</p>
			) : null}

			<div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
				<p>
					<span className="font-semibold text-white">App:</span>{' '}
					{appLabelForChallenge(challenge)}
				</p>
				<p>
					<span className="font-semibold text-white">Signatura ID:</span>{' '}
					{challenge?.signaturaId}
				</p>
				{challenge?.browserUserAgent ? (
					<p className="mt-2">
						<span className="font-semibold text-white">Browser/device:</span>{' '}
						<span className="break-words text-slate-300">
							{challenge.browserUserAgent}
						</span>
					</p>
				) : null}
				<p className="mt-2">
					<span className="font-semibold text-white">Short code:</span>{' '}
					<span className="font-mono tracking-[0.25em]">{normalizedCode}</span>
				</p>
				{challenge?.expiresAt ? (
					<p className="mt-2 text-xs text-slate-400">
						Challenge expires in {countdown || 'soon'} at{' '}
						{formatExpiry(challenge.expiresAt)}.
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
					{isSubmitting
						? 'Approving...'
						: isAdminQr(challenge)
							? 'Approve Admin Sign-in'
							: isIssuerQr(challenge)
								? 'Approve Issuer Sign-in'
							: 'Approve with passkey'}
				</button>
			)}

			{status && !approved ? (
				<p className="mt-4 text-sm text-slate-200">{status}</p>
			) : null}
			{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
		</section>
	);
}
