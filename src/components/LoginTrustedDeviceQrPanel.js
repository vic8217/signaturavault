'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import { buildExternalLoginReturnUrl } from '@/lib/externalLoginReturn';
import { signaturaApiRequest } from '@/lib/registration-api-client';
import { storeTrustedDeviceSignaturaId } from '@/lib/trustedDeviceLoginClient';

const POLL_INTERVAL_MS = 2000;
const NO_TRUSTED_DEVICE_MESSAGE =
	'No trusted device is registered for this Signatura ID. Register a trusted device first.';

function formatCode(value) {
	return String(value || '')
		.trim()
		.toUpperCase()
		.split('')
		.join(' ');
}

export function LoginTrustedDeviceQrPanel({
	signaturaId,
	nextPath = '/signatura/dashboard',
	externalReturnUrl = '',
	oauthState = '',
	startEndpoint = '/api/auth/login/remote/start',
	startPayload = {},
	remoteLoginContext = {},
	onCancel,
}) {
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');
	const [challenge, setChallenge] = useState(null);
	const [browserSecret, setBrowserSecret] = useState('');
	const [qrDataUrl, setQrDataUrl] = useState('');
	const [pollStatus, setPollStatus] = useState('');
	const [canRegisterDevice, setCanRegisterDevice] = useState(false);
	const pollTimerRef = useRef(null);
	const normalizedSignaturaId = String(signaturaId || '').trim().toUpperCase();

	useEffect(() => {
		return () => {
			if (pollTimerRef.current) clearInterval(pollTimerRef.current);
		};
	}, []);

	async function renderQrDataUrl(qrUrl) {
		const { default: QRCode } = await import('qrcode');
		return QRCode.toDataURL(qrUrl, {
			margin: 1,
			width: 200,
			color: { dark: '#ffffff', light: '#0f172a' },
		});
	}

	function resetChallenge() {
		if (pollTimerRef.current) {
			clearInterval(pollTimerRef.current);
			pollTimerRef.current = null;
		}
		setChallenge(null);
		setBrowserSecret('');
		setQrDataUrl('');
		setPollStatus('');
		setError('');
		setCanRegisterDevice(false);
	}

	async function completeExternalReturn(challengeId, resolvedSignaturaId) {
		const externalReturnHref = buildExternalLoginReturnUrl(externalReturnUrl, {
			signaturaId: resolvedSignaturaId,
			challengeId,
			state: oauthState,
		});
		if (!externalReturnHref) {
			throw new Error('Unable to build ACCURA return URL.');
		}
		window.location.href = externalReturnHref;
		return true;
	}

	async function pollChallenge(challengeId, secret) {
		const { response, data: body } = await signaturaApiRequest(
			'/api/auth/login/remote/poll',
			{
				method: 'POST',
				body: JSON.stringify({ challengeId, browserSecret: secret }),
				cache: 'no-store',
			},
			'Trusted device login poll',
		);
		if (!response.ok || body?.ok === false) {
			throw new Error(body?.error || 'Unable to poll login challenge.');
		}

		setPollStatus(body.status || 'PENDING');
		if (body.status === 'APPROVED') {
			if (pollTimerRef.current) {
				clearInterval(pollTimerRef.current);
				pollTimerRef.current = null;
			}
			setSubmitting(true);
			const resolvedSignaturaId =
				String(body.signaturaId || '').trim().toUpperCase() ||
				normalizedSignaturaId;
			if (body.redirectUrl) {
				window.location.href = body.redirectUrl;
				return true;
			}
			if (externalReturnUrl) {
				return completeExternalReturn(challengeId, resolvedSignaturaId);
			}
			if (!body.approvalToken) {
				throw new Error('Login approval token is missing.');
			}
			const { response: finishResponse, data: finishBody } = await signaturaApiRequest(
				'/api/auth/login/remote/finish',
				{
					method: 'POST',
					body: JSON.stringify({
						challengeId,
						browserSecret: secret,
						approvalToken: body.approvalToken,
					}),
					cache: 'no-store',
				},
				'Trusted device login finish',
			);
			if (!finishResponse.ok || finishBody?.ok === false) {
				throw new Error(finishBody?.error || 'Unable to complete trusted device login.');
			}
			storeTrustedDeviceSignaturaId(resolvedSignaturaId);
			const destination = new URL(finishBody.next || nextPath, window.location.origin);
			if (finishBody.canRegisterDevice) {
				destination.searchParams.set('registerTrustedDevice', '1');
				destination.searchParams.set(
					'signaturaId',
					normalizedSignaturaId,
				);
			}
			window.location.href = destination.toString();
			return true;
		}

		if (
			body.status === 'EXPIRED' ||
			body.status === 'DENIED' ||
			body.status === 'CONSUMED'
		) {
			if (pollTimerRef.current) {
				clearInterval(pollTimerRef.current);
				pollTimerRef.current = null;
			}
			setSubmitting(false);
			if (body.status === 'EXPIRED') {
				setError('Trusted device login expired. Start again.');
			}
			resetChallenge();
			return true;
		}
		return false;
	}

	async function startRemoteLogin() {
		resetChallenge();
		setSubmitting(true);
		setError('');
		try {
			const { response, data: body } = await signaturaApiRequest(
				startEndpoint,
				{
					method: 'POST',
					body: JSON.stringify({
						signaturaId,
						next: nextPath,
						...startPayload,
						...(remoteLoginContext.clientId
							? { clientId: remoteLoginContext.clientId }
							: {}),
						...(remoteLoginContext.sourceApp
							? {
									sourceApp: remoteLoginContext.sourceApp,
									source: remoteLoginContext.sourceApp,
								}
							: {}),
						...(remoteLoginContext.requesterOrigin
							? { requesterOrigin: remoteLoginContext.requesterOrigin }
							: {}),
					}),
					cache: 'no-store',
				},
				'Trusted device login start',
			);
			if (!response.ok || body?.ok === false) {
				throw new Error(body?.error || 'Unable to start trusted device login.');
			}

			setChallenge({
				id: body.challengeId,
				shortCode: body.shortCode,
				expiresAt: body.expiresAt,
				qrUrl: body.qrUrl,
			});
			setBrowserSecret(body.browserSecret);
			setQrDataUrl(await renderQrDataUrl(body.qrUrl));
			setPollStatus('PENDING');

			pollTimerRef.current = setInterval(() => {
				pollChallenge(body.challengeId, body.browserSecret).catch((pollError) => {
					setError(
						pollError instanceof Error
							? pollError.message
							: 'Unable to poll login challenge.',
					);
					setSubmitting(false);
				});
			}, POLL_INTERVAL_MS);
		} catch (startError) {
			setError(
				startError instanceof Error
					? startError.message
					: 'Unable to start trusted device login.',
			);
			setSubmitting(false);
		}
	}

	useEffect(() => {
		if (!normalizedSignaturaId) return;
		// eslint-disable-next-line react-hooks/set-state-in-effect
		startRemoteLogin();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const registerDeviceHref = `/register?next=${encodeURIComponent(nextPath)}&signaturaId=${encodeURIComponent(signaturaId)}&setup=device`;

	return (
		<div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
			<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
				Approve with trusted device (QR)
			</p>
			<p className="mt-3 text-sm leading-6 text-slate-300">
				Scan this QR code with the phone that was registered as your trusted
				Signatura device during enrollment, then approve with passkey or biometric
				on that phone.
			</p>

			{challenge ? (
				<div className="mt-5 grid gap-5 md:grid-cols-[200px_1fr]">
					{qrDataUrl ? (
						<Image
							src={qrDataUrl}
							alt="Trusted device login QR code"
							width={200}
							height={200}
							unoptimized
							className="mx-auto rounded-xl border border-white/10 bg-slate-950 p-2"
						/>
					) : null}
					<div className="space-y-3 text-sm text-slate-200">
						<p>
							<span className="font-semibold text-white">Short code:</span>{' '}
							<span className="font-mono text-lg tracking-[0.3em]">
								{formatCode(challenge.shortCode)}
							</span>
						</p>
						<p className="text-xs leading-5 text-slate-400">
							Open Signatura on your enrolled trusted phone, scan the QR code or
							enter this code at{' '}
							<Link
								href="/login/remote-approve/scan"
								className="font-semibold text-red-200 hover:text-white">
								/login/remote-approve/scan
							</Link>
							. The phone must be signed in as{' '}
							<span className="font-mono text-white">{signaturaId}</span> before
							approving. Generic QR scanners on unregistered phones cannot approve
							this login.
						</p>
						<p className="text-xs text-slate-400">
							Status:{' '}
							<span className="font-semibold text-red-200">
								{pollStatus || 'PENDING'}
							</span>
						</p>
						<button
							type="button"
							onClick={() => {
								resetChallenge();
								onCancel?.();
							}}
							className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white transition hover:border-red-400">
							Cancel
						</button>
					</div>
				</div>
			) : null}

			{error ? (
				<div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-4">
					<p className="text-sm leading-6 text-red-50">{error}</p>
					{error === NO_TRUSTED_DEVICE_MESSAGE ? (
						<Link
							href={registerDeviceHref}
							className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
							Register trusted device
						</Link>
					) : null}
				</div>
			) : null}
			{submitting && !error ? (
				<p className="mt-4 text-sm text-slate-300">
					Waiting for approval on your enrolled trusted device...
				</p>
			) : null}
			{canRegisterDevice ? (
				<p className="mt-4 text-sm text-slate-300">
					After sign-in you can{' '}
					<Link href={registerDeviceHref} className="font-semibold text-red-200">
						register this browser as a trusted device
					</Link>
					.
				</p>
			) : null}
		</div>
	);
}
