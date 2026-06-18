'use client';

import Link from 'next/link';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { LoginTrustedDeviceQrPanel } from './LoginTrustedDeviceQrPanel';

function SignaturaAuthorizeForm({
	clientId,
	returnUrl,
	expectedSignaturaId,
	rolePrefix,
	source,
	state,
}) {
	const expected = String(expectedSignaturaId || '').trim().toUpperCase();

	function buildAuthorizeReturnPath() {
		const params = new URLSearchParams();
		if (clientId) params.set('clientId', clientId);
		if (returnUrl) params.set('returnUrl', returnUrl);
		if (expected) params.set('expectedSignaturaId', expected);
		if (rolePrefix) params.set('rolePrefix', rolePrefix);
		if (source) params.set('source', source);
		if (state) params.set('state', state);
		const query = params.toString();
		return query ? `/login/authorize?${query}` : '/login/authorize';
	}

	function recoveryHref(path) {
		const params = new URLSearchParams();
		if (expected) params.set('signaturaId', expected);
		params.set('next', buildAuthorizeReturnPath());
		return `${path}?${params.toString()}`;
	}

	return (
		<div>
			<div className="min-w-0 p-4 sm:p-10 lg:p-12">
				<div className="flex items-center gap-4 sm:gap-5">
					<span className="grid h-14 w-14 shrink-0 place-items-center text-red-400 sm:h-16 sm:w-16">
						<ShieldCheck className="h-11 w-11 sm:h-12 sm:w-12" aria-hidden="true" />
					</span>
					<div className="min-w-0">
						<p className="text-2xl font-black sm:text-4xl">
							Approve ACCURA login
						</p>
					</div>
				</div>

				<div className="mt-8 rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-slate-300">
					<p>
						ACCURA expects{' '}
						<span className="font-mono text-white">{expectedSignaturaId}</span>
						{rolePrefix ? (
							<>
								{' '}
								with role prefix{' '}
								<span className="font-mono text-white">{rolePrefix}</span>
							</>
						) : null}
						.
					</p>
					<p className="mt-3 text-slate-400">
						Approve from the phone that was enrolled as your trusted Signatura
						device. Browser passkey prompts and generic QR scanners on other
						phones cannot authorize ACCURA login.
					</p>
				</div>

				<LoginTrustedDeviceQrPanel
					signaturaId={expected}
					nextPath="/login/authorize"
					externalReturnUrl={returnUrl}
					oauthState={state}
					startEndpoint="/api/auth/login/authorize/start"
					startPayload={{
						clientId,
						source,
						returnUrl,
						expectedSignaturaId: expected,
						rolePrefix,
						state,
					}}
					remoteLoginContext={{
						clientId: 'accura',
						sourceApp: 'ACCURA',
						requesterOrigin:
							typeof window !== 'undefined' ? window.location.origin : '',
					}}
				/>

				<div className="mt-8 flex items-center gap-4 py-1 text-sm font-semibold text-slate-400">
					<span className="h-px flex-1 bg-white/10" />
					<span>or</span>
					<span className="h-px flex-1 bg-white/10" />
				</div>

				<p className="text-sm leading-6 text-slate-400">
					No passkey on your enrolled trusted device? Recover your Signatura
					identity first, register a new trusted device, then return here to
					approve ACCURA login.
				</p>

				<div className="mt-5 grid gap-3">
					<Link
						href={recoveryHref('/account-recovery/recovery-code')}
						className="flex h-14 w-full items-center justify-center rounded-lg border border-white/15 px-4 text-base font-bold text-red-100 transition hover:border-red-300 hover:text-white">
						Use recovery phrase
					</Link>

					<Link
						href={recoveryHref('/account-recovery/manual')}
						className="flex h-14 w-full items-center justify-center rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 text-base font-bold text-amber-100 transition hover:border-amber-300 hover:bg-amber-400/15">
						Request manual recovery
					</Link>
				</div>
			</div>

			<div className="border-t border-white/10 bg-black/15 px-4 py-6 sm:px-10 lg:px-12">
				<div className="flex items-center gap-4 text-slate-400">
					<span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-slate-700 text-red-400">
						<LockKeyhole className="h-7 w-7" aria-hidden="true" />
					</span>
					<p className="text-sm leading-6 sm:text-base">
						ACCURA receives only a short-lived Signatura assertion after your
						enrolled trusted device approves this login with passkey or biometric.
					</p>
				</div>
			</div>
		</div>
	);
}

export { SignaturaAuthorizeForm };
