'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PasskeyNotice } from './PasskeyNotice';

function IssuerActivationForm({ token, isSignedIn = false, signedInSignaturaId = '' }) {
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');
	const [isActivated, setIsActivated] = useState(false);
	const [activatedUser, setActivatedUser] = useState(null);
	const [isLinking, setIsLinking] = useState(false);
	const attemptedActivationRef = useRef(false);
	const hasToken = useMemo(() => Boolean(token), [token]);
	const activationPath = `/issuer/activate?token=${encodeURIComponent(token || '')}`;
	const loginHref = `/login?next=${encodeURIComponent(activationPath)}&method=qr`;
	const createHref = `/register?next=${encodeURIComponent(activationPath)}&issuerInvitationToken=${encodeURIComponent(token || '')}`;

	async function acceptIssuerInvitation() {
		if (isLinking || isActivated) return;
		setError('');
		setIsActivated(false);
		setActivatedUser(null);
		setStatus('Validating issuer invitation...');
		setIsLinking(true);

		if (!hasToken) {
			setError('Activation token is missing.');
			setStatus('');
			setIsLinking(false);
			return;
		}

		try {
			setStatus('Linking issuer access to your Signatura ID...');
			const response = await fetch(
				'/api/issuer-invitations/activation/accept',
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ token }),
				},
			);
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(
					data.error ||
						'Please sign in with your Signatura ID to accept this issuer invitation.',
				);
			}

			setStatus('Issuer access linked successfully. Opening issuer portal...');
			setActivatedUser(data.user || null);
			setIsActivated(true);
			window.setTimeout(() => {
				window.location.href = data.next || '/issuer';
			}, 2500);
		} catch (activationError) {
			setError(
				activationError instanceof Error
					? activationError.message
					: 'Unable to accept issuer invitation.',
			);
			setStatus('');
		} finally {
			setIsLinking(false);
		}
	}

	useEffect(() => {
		if (!isSignedIn || !hasToken || attemptedActivationRef.current) return;
		attemptedActivationRef.current = true;
		void acceptIssuerInvitation();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isSignedIn, hasToken]);

	return (
		<div className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-950/90 p-6 text-white shadow-2xl">
			<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
				Issuer activation
			</p>
			<h1 className="mt-2 text-3xl font-black">
				Link issuer access to your Signatura ID
			</h1>

			<div className="mt-5">
				<PasskeyNotice />
			</div>

			<p className="mt-5 text-sm leading-6 text-slate-300">
				Issuer access is a role on your universal Signatura identity. This
				invitation will not create a second Signatura ID for the same person.
			</p>

			{isSignedIn ? (
				<div className="mt-6 grid gap-4">
					{signedInSignaturaId ? (
						<div className="rounded-xl border border-white/10 bg-slate-900/70 p-4">
							<p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
								Signed in as
							</p>
							<p className="mt-2 font-mono text-sm font-bold text-white">
								{signedInSignaturaId}
							</p>
						</div>
					) : null}
					<button
						type="button"
						onClick={acceptIssuerInvitation}
						disabled={isActivated || isLinking}
						className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
						{isLinking ? 'Linking issuer access...' : 'Link issuer access to your Signatura ID'}
					</button>
				</div>
			) : null}

			{!isSignedIn ? (
				<div className="mt-6 grid gap-3">
					<Link
						href={loginHref}
						className="rounded-xl bg-red-500 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-red-400">
						Please sign in with your Signatura ID to accept this issuer invitation.
					</Link>
					<Link
						href={createHref}
						className="rounded-xl border border-white/15 px-5 py-3 text-center text-sm font-bold text-slate-200 transition hover:border-red-400 hover:text-white">
						Create Signatura ID
					</Link>
				</div>
			) : null}

			{status ? <p className="mt-4 text-sm text-slate-200">{status}</p> : null}
			{error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
			{isActivated ? (
				<div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-950/20 p-5">
					<p className="font-bold text-emerald-100">
						Issuer access linked successfully.
					</p>
					<p className="mt-3 text-sm text-slate-200">
						Signatura ID:{' '}
						<span className="font-mono font-bold">
							{activatedUser?.signaturaId || signedInSignaturaId}
						</span>
					</p>
					<p className="mt-1 text-sm text-slate-200">
						Role added: <span className="font-bold">Issuer Admin</span>
					</p>
					<Link
						href="/issuer"
						className="mt-4 inline-flex rounded-xl bg-red-500 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-red-400">
						Open issuer portal
					</Link>
				</div>
			) : null}
		</div>
	);
}

export { IssuerActivationForm };
