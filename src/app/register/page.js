import Link from 'next/link';
import { RegisterPasskeyForm } from '@/components/RegisterPasskeyForm';
import { externalReturnUrlFromParams } from '@/lib/externalReturnUrl';
import { normalizeLoginNextPath } from '@/lib/portalRoutes';
import {
	registrationContextFromParams,
	validateAccuraRegistrationContext,
} from '@/lib/registrationSource';

export default async function RegisterPage({ searchParams }) {
	const params = await searchParams;
	const requestedNext = params?.next || '';
	const externalReturnUrl = externalReturnUrlFromParams(params);
	const registrationContext = registrationContextFromParams(params);
	const registrationContextError =
		registrationContext.source === 'accura'
			? 'This ACCURA registration link is outdated. Return to ACCURA and generate a new secure registration QR code.'
			: registrationContext.error ||
				validateAccuraRegistrationContext(registrationContext, {
					returnUrl: externalReturnUrl,
				});
	const requestedSignaturaId = params?.signaturaId || '';
	const setupMode = params?.setup === 'device' ? 'device' : '';
	const requestedAccountType =
		typeof params?.accountType === 'string' ? params.accountType : '';
	const accountType = requestedAccountType === 'issuer' ? 'issuer' : 'user';
	const defaultNext = accountType === 'issuer' ? '/issuer' : '/signatura/dashboard';
	const nextPath = normalizeLoginNextPath(
		typeof requestedNext === 'string' && requestedNext.startsWith('/')
			? requestedNext
			: defaultNext,
	);
	const initialSignaturaId =
		typeof requestedSignaturaId === 'string' ? requestedSignaturaId : '';

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-10">
			<div className="mx-auto mb-8 max-w-5xl text-white">
				<Link href="/" className="text-sm font-bold uppercase tracking-[0.18em]">
					Signatura
				</Link>
			</div>
			{registrationContextError ? (
				<section className="mx-auto w-full max-w-2xl rounded-2xl border border-red-500/30 bg-slate-950/90 p-6 text-white shadow-2xl">
					<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
						Registration source
					</p>
					<h1 className="mt-2 text-3xl font-black">
						{registrationContextError}
					</h1>
					<p className="mt-3 text-sm leading-6 text-slate-300">
						Use a supported application link to continue registration.
					</p>
				</section>
			) : (
				<RegisterPasskeyForm
					nextPath={nextPath}
					externalReturnUrl={externalReturnUrl}
					appRegistrationContext={registrationContext}
					initialSignaturaId={initialSignaturaId}
					initialAccountType={accountType}
					showIssuerRegistrationLink={
						accountType === 'user' && !setupMode && registrationContext.source !== 'accura'
					}
					setupMode={setupMode}
				/>
			)}
		</main>
	);
}
