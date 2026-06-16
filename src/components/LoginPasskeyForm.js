'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
	ArrowRight,
	ChevronRight,
	LockKeyhole,
	RefreshCcw,
	ShieldCheck,
	Smartphone,
	UserRound,
} from 'lucide-react';
import {
	browserSupportsWebAuthn,
	startAuthentication,
} from '@simplewebauthn/browser';
import { LoginTrustedDeviceQrPanel } from './LoginTrustedDeviceQrPanel';

const UNREGISTERED_PASSKEY_ERROR = 'No passkey is registered for this account';
const PASSKEY_DOMAIN_MISMATCH_ERROR =
	'No usable passkey was found for this site. If this SIGNATURA ID was created on localhost or a different ngrok URL, register this phone as a trusted device for the current URL.';

function accountTypeForNextPath(nextPath) {
	if (nextPath === '/admin' || nextPath.startsWith('/admin/')) return 'admin';
	if (nextPath === '/issuer' || nextPath.startsWith('/issuer/')) return 'issuer';
	return 'user';
}

function ActionRow({ href, icon: Icon, children }) {
	return (
		<Link
			href={href}
			className="group flex min-h-16 items-center gap-4 border-b border-white/10 py-4 text-white transition hover:border-red-400/40 hover:text-red-100">
			<span className="grid h-10 w-10 shrink-0 place-items-center text-red-400">
				<Icon className="h-6 w-6" aria-hidden="true" />
			</span>
			<span className="min-w-0 flex-1 text-base font-semibold sm:text-lg">
				{children}
			</span>
			<ChevronRight
				className="h-5 w-5 shrink-0 text-slate-500 transition group-hover:translate-x-1 group-hover:text-red-300"
				aria-hidden="true"
			/>
		</Link>
	);
}

function LoginPasskeyForm({
	nextPath = '/signatura/dashboard',
	externalReturnUrl = '',
	appRegistrationContext = {},
}) {
	const [signaturaId, setSignaturaId] = useState('');
	const [step, setStep] = useState('id');
	const [status, setStatus] = useState('');
	const [error, setError] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [canRegisterDevice, setCanRegisterDevice] = useState(false);
	const normalizedSignaturaId = signaturaId.trim();
	const loginAccountType = accountTypeForNextPath(nextPath);
	const registrationSource = String(appRegistrationContext.source || '').toLowerCase();
	const remoteLoginContext =
		registrationSource === 'accura'
			? {
					clientId: 'accura',
					sourceApp: 'ACCURA',
					requesterOrigin:
						typeof window !== 'undefined' ? window.location.origin : '',
				}
			: registrationSource === 'haven'
				? {
						clientId: 'havenxsig_client',
						sourceApp: 'HAVEN',
						requesterOrigin:
							typeof window !== 'undefined' ? window.location.origin : '',
					}
				: {};
	const registrationContextQuery =
		registrationSource === 'accura'
			? `&source=accura&companyCode=${encodeURIComponent(
					appRegistrationContext.companyCode || '',
				)}&companyName=${encodeURIComponent(
					appRegistrationContext.companyName || '',
				)}`
			: registrationSource
				? `&source=${encodeURIComponent(registrationSource)}`
				: '';
	const createAccountHref =
		loginAccountType === 'admin'
			? `/admin/register?next=${encodeURIComponent(nextPath)}`
			: `/register?next=${encodeURIComponent(nextPath)}${
					loginAccountType === 'issuer' ? '&accountType=issuer' : ''
				}${registrationContextQuery}${
					externalReturnUrl
						? `&returnUrl=${encodeURIComponent(externalReturnUrl)}`
						: ''
				}`;
	const registerDeviceHref = `/register?next=${encodeURIComponent(nextPath)}&signaturaId=${encodeURIComponent(normalizedSignaturaId)}&setup=device${
		registrationContextQuery
	}${
		externalReturnUrl ? `&returnUrl=${encodeURIComponent(externalReturnUrl)}` : ''
	}`;
	const recoveryPhraseHref = `/account-recovery/recovery-code?next=${encodeURIComponent(nextPath)}`;
	const accountRecoveryHref = `/account-recovery/manual?next=${encodeURIComponent(nextPath)}`;
	const showDeviceRegistration =
		error === UNREGISTERED_PASSKEY_ERROR ||
		error === PASSKEY_DOMAIN_MISMATCH_ERROR ||
		canRegisterDevice;

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const signaturaIdFromUrl =
			params.get('signaturaId') || params.get('signatura_id') || '';
		if (signaturaIdFromUrl && !signaturaId.trim()) {
			setSignaturaId(signaturaIdFromUrl);
		}
		if (externalReturnUrl && signaturaIdFromUrl) {
			setStep('qr');
		}

		const syncAutofill = () => {
			const input = document.querySelector('input[name="signaturaId"]');
			if (input?.value && !signaturaId.trim() && !signaturaIdFromUrl) {
				setSignaturaId(input.value);
			}
		};
		syncAutofill();
		const timer = window.setTimeout(syncAutofill, 250);
		return () => window.clearTimeout(timer);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [externalReturnUrl]);

	function updateSignaturaId(value) {
		setSignaturaId(value);
		if (!value.trim() && step !== 'id') {
			setStep('id');
		}
	}

	function continueToMethods() {
		if (!normalizedSignaturaId) {
			setError('Enter your Signatura ID to continue.');
			return;
		}
		setError('');
		setStatus('');
		setStep('methods');
	}

	async function startLocalPasskeyLogin() {
		if (isSubmitting) return;
		setError('');
		setCanRegisterDevice(false);
		setIsSubmitting(true);
		setStatus('Preparing passkey login on this device...');

		try {
			const isLocalhost =
				window.location.hostname === 'localhost' ||
				window.location.hostname === '127.0.0.1';

			if (!window.isSecureContext && !isLocalhost) {
				throw new Error(
					'Passkeys require HTTPS on phones. Open Signatura using a secure HTTPS address, or test on localhost from the same device.',
				);
			}

			if (!browserSupportsWebAuthn()) {
				throw new Error('This browser does not support passkeys/WebAuthn.');
			}

			const startResponse = await fetch('/api/auth/login/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ signaturaId: normalizedSignaturaId }),
			});
			const startData = await startResponse.json();
			if (!startResponse.ok) throw new Error(startData.error);

			setStatus('Approve the login with your device passkey.');
			let assertion;
			const passkeyPromptTimer = window.setTimeout(() => {
				setCanRegisterDevice(true);
				setStatus(
					'Still waiting for a passkey prompt. If nothing appeared, register this phone for the current website address.',
				);
			}, 5000);
			try {
				assertion = await startAuthentication({
					optionsJSON: startData.options,
				});
			} catch {
				throw new Error(PASSKEY_DOMAIN_MISMATCH_ERROR);
			} finally {
				window.clearTimeout(passkeyPromptTimer);
			}

			const finishResponse = await fetch('/api/auth/login/finish', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					userId: startData.userId,
					next: nextPath,
					response: assertion,
				}),
			});
			const finishData = await finishResponse.json();
			if (!finishResponse.ok) throw new Error(finishData.error);

			setStatus('Login verified. Opening portal...');
			window.location.href = finishData.next || nextPath;
		} catch (loginError) {
			const message =
				loginError instanceof Error ? loginError.message : 'Login failed.';
			if (message === UNREGISTERED_PASSKEY_ERROR) {
				setStatus(
					'No trusted device is registered yet. Opening device registration...',
				);
				window.location.href = registerDeviceHref;
				return;
			}
			setError(message);
			setStatus('');
		} finally {
			setIsSubmitting(false);
		}
	}

		return (
			<div className="mx-auto w-full min-w-0 max-w-2xl overflow-hidden rounded-lg border border-red-500/80 bg-[#020912]/86 text-white shadow-[0_28px_90px_rgba(0,0,0,0.55),0_0_42px_rgba(239,68,68,0.13)] backdrop-blur-xl">
				<div className="min-w-0 p-4 sm:p-10 lg:p-12">
					<div className="flex items-center gap-4 sm:gap-5">
						<span className="grid h-14 w-14 shrink-0 place-items-center text-red-400 sm:h-16 sm:w-16">
							<ShieldCheck className="h-11 w-11 sm:h-12 sm:w-12" aria-hidden="true" />
						</span>
						<div className="min-w-0">
							<p className="text-2xl font-black sm:text-4xl">
								{nextPath === '/admin' || nextPath.startsWith('/admin/')
									? 'Admin secure sign-in'
									: nextPath === '/issuer' || nextPath.startsWith('/issuer/')
										? 'Issuer secure sign-in'
										: 'Sign in securely'}
							</p>
						</div>
					</div>

					<p className="mt-6 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">
						Enter your Signatura ID. You will approve this login from a registered
						trusted device.
					</p>

					{step === 'id' ? (
						<div className="mt-8 grid min-w-0 gap-5">
							<label className="grid min-w-0 gap-3 text-base font-bold">
								<span>Signatura ID</span>
								<span className="grid h-16 min-w-0 grid-cols-[3rem_auto_minmax(0,1fr)] items-center rounded-lg border border-slate-600/80 bg-[#07111d]/90 px-2 text-slate-100 shadow-inner shadow-black/30 transition focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-500/40 sm:grid-cols-[4rem_auto_minmax(0,1fr)] sm:px-3">
									<span className="grid h-10 w-12 shrink-0 place-items-center rounded-lg border border-red-500/75 bg-[#07111d] text-sm font-black text-red-400 sm:h-11 sm:w-16 sm:text-base">
										SIG
									</span>
									<span className="mx-3 h-9 w-px shrink-0 bg-slate-600 sm:mx-4" />
									<input
										type="text"
										required
										name="signaturaId"
										value={signaturaId}
										onChange={(event) => updateSignaturaId(event.target.value)}
										onInput={(event) => updateSignaturaId(event.currentTarget.value)}
										autoComplete="username"
										placeholder={
											loginAccountType === 'admin'
												? 'SIG-A-8FD2-A91C'
												: loginAccountType === 'issuer'
													? 'SIG-I-8FD2-A91C'
													: 'SIG-U-8FD2-A91C'
										}
										className="block min-w-0 bg-transparent text-base font-semibold text-white outline-none placeholder:text-slate-500 sm:text-xl"
									/>
								</span>
							</label>
							<button
								type="button"
								onClick={continueToMethods}
								disabled={isSubmitting || !normalizedSignaturaId}
								className="group flex h-16 w-full min-w-0 max-w-full items-center justify-center gap-3 rounded-lg bg-red-500 px-4 text-base font-bold text-white shadow-[0_14px_34px_rgba(239,68,68,0.32)] transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:shadow-none sm:gap-4 sm:px-5 sm:text-lg">
								<span>Continue</span>
								<ArrowRight
									className="h-6 w-6 transition group-hover:translate-x-1"
									aria-hidden="true"
								/>
							</button>

							<div className="flex items-center gap-6 py-4 text-sm font-semibold text-slate-400">
								<span className="h-px flex-1 bg-white/10" />
								<span>or</span>
								<span className="h-px flex-1 bg-white/10" />
							</div>

							<div>
								<ActionRow href={createAccountHref} icon={UserRound}>
									Create new Signatura account
								</ActionRow>
								<ActionRow href={recoveryPhraseHref} icon={RefreshCcw}>
									Recover access
								</ActionRow>
								<ActionRow href={accountRecoveryHref} icon={Smartphone}>
									I lost my trusted device
								</ActionRow>
							</div>
						</div>
					) : null}

					{step === 'methods' && normalizedSignaturaId ? (
						<div className="mt-8 grid gap-5">
							<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
								<div>
									<p className="text-sm font-bold uppercase text-red-300">
										Trusted device
									</p>
									<p className="mt-2 text-sm leading-6 text-slate-300">
										Use the trusted passkey registered on this browser for{' '}
										<span className="font-mono text-white">
											{normalizedSignaturaId}
										</span>
										.
									</p>
								</div>
								<button
									type="button"
									onClick={() => setStep('id')}
									className="self-start text-sm font-semibold text-red-200 transition hover:text-white">
									Change ID
								</button>
							</div>
							<button
								type="button"
								onClick={startLocalPasskeyLogin}
								disabled={isSubmitting}
								className="rounded-lg bg-red-500 px-5 py-4 text-base font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
								{isSubmitting ? 'Preparing passkey...' : 'Sign in with this device passkey'}
							</button>
							<button
								type="button"
								onClick={() => {
									setError('');
									setStatus('');
									setStep('qr');
								}}
								className="rounded-lg border border-white/15 px-5 py-4 text-base font-bold text-red-100 transition hover:border-red-300 hover:text-white">
								Use another trusted device (QR)
							</button>
						</div>
					) : null}

					{step === 'qr' && normalizedSignaturaId ? (
						<div className="mt-8">
							<div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
								<div>
									<p className="text-sm font-bold uppercase text-red-300">
										Trusted device approval
									</p>
									<p className="mt-2 text-sm leading-6 text-slate-300">
										{externalReturnUrl
											? 'Approve this ACCURA login on a trusted Signatura phone. ACCURA will not accept passkey-only sign-in for this return flow.'
											: 'Scan and approve on a device already registered for'}{' '}
										<span className="font-mono text-white">
											{normalizedSignaturaId}
										</span>
									</p>
								</div>
								<button
									type="button"
									onClick={() => setStep('id')}
									className="self-start text-sm font-semibold text-red-200 transition hover:text-white">
									Change ID
								</button>
							</div>
							<LoginTrustedDeviceQrPanel
								signaturaId={normalizedSignaturaId}
								nextPath={nextPath}
								externalReturnUrl={externalReturnUrl}
								remoteLoginContext={remoteLoginContext}
								onCancel={() => setStep('id')}
							/>
						</div>
					) : null}

					{status ? (
						<p className="mt-5 rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-slate-200">
							{status}
						</p>
					) : null}
					{error ? (
						<p className="mt-5 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm leading-6 text-red-100">
							{error}
						</p>
					) : null}
					{showDeviceRegistration ? (
						<div className="mt-5 rounded-lg border border-red-400/40 bg-red-500/10 p-4">
							<p className="text-sm leading-6 text-red-50">
								Use device registration to connect this Signatura ID to the current
								phone and website address.
							</p>
							<Link
								href={registerDeviceHref}
								className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
								Register trusted device for this ID
							</Link>
							<Link
								href={createAccountHref}
								className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-white/15 px-5 py-3 text-sm font-bold text-red-100 transition hover:border-red-300">
								Register new Signatura account
							</Link>
						</div>
					) : null}
				</div>

					<div className="border-t border-white/10 bg-black/15 px-4 py-6 sm:px-10 lg:px-12">
					<div className="flex items-center gap-4 text-slate-400">
						<span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-slate-700 text-red-400">
							<LockKeyhole className="h-7 w-7" aria-hidden="true" />
						</span>
						<p className="text-sm leading-6 sm:text-base">
							No password is used.
							<br />
							Your identity is protected by trusted-device approval.
						</p>
					</div>
				</div>
			</div>
		);
	}

export { LoginPasskeyForm };
