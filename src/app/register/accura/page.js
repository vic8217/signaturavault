import Link from 'next/link';
import { RegisterPasskeyForm } from '@/components/RegisterPasskeyForm';
import { AccuraOnboardingLinkForm } from '@/components/AccuraOnboardingLinkForm';
import {
	ACCURA_ONBOARDING_ACTIONS,
	auditAccuraOnboardingEvent,
} from '@/lib/accuraOnboardingAudit';
import {
	accuraRegistrationContextForForm,
	verifyAccuraRegistrationHandoffToken,
} from '@/lib/accuraRegistrationHandoff';
import { normalizeLoginNextPath } from '@/lib/portalRoutes';

const EXPIRED_MESSAGE =
	'ACCURA registration session expired. Please ask your Company Admin to generate a new registration key.';

function firstParam(value) {
	return Array.isArray(value) ? value[0] : value;
}

export default async function AccuraRegisterPage({ searchParams }) {
	const params = await searchParams;
	const handoffToken = String(
		firstParam(params?.handoffToken) ||
			firstParam(params?.token) ||
			firstParam(params?.registrationHandoff) ||
			'',
	).trim();
	const verified = verifyAccuraRegistrationHandoffToken(handoffToken);
	const context = verified.valid
		? accuraRegistrationContextForForm(verified.context)
		: null;
	const nextPath = normalizeLoginNextPath(
		String(firstParam(params?.next) || '/signatura/dashboard'),
	);

	if (verified.valid && verified.context) {
		await auditAccuraOnboardingEvent({
			action: ACCURA_ONBOARDING_ACTIONS.REQUEST_RECEIVED,
			context: verified.context,
			details: { entrypoint: '/register/accura' },
		});
	} else {
		await auditAccuraOnboardingEvent({
			action: ACCURA_ONBOARDING_ACTIONS.REQUEST_FAILED,
			result: 'failed',
			context: verified.context || {},
			details: {
				reason: verified.reason || verified.error || 'invalid_handoff',
				entrypoint: '/register/accura',
			},
		});
	}

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-10">
			<div className="mx-auto mb-8 max-w-5xl text-white">
				<Link href="/" className="text-sm font-bold uppercase tracking-[0.18em]">
					Signatura
				</Link>
			</div>
			{!context ? (
				<section className="mx-auto w-full max-w-2xl rounded-2xl border border-red-500/30 bg-slate-950/90 p-6 text-white shadow-2xl">
					<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
						ACCURA registration
					</p>
					<h1 className="mt-2 text-3xl font-black">{EXPIRED_MESSAGE}</h1>
					<p className="mt-3 text-sm leading-6 text-slate-300">
						Return to ACCURA and start system admin registration again from the admin register page.
					</p>
				</section>
			) : context.mode === 'link' ? (
				<AccuraOnboardingLinkForm
					accuraHandoffToken={handoffToken}
					appRegistrationContext={context}
				/>
			) : (
				<RegisterPasskeyForm
					nextPath={nextPath}
					externalReturnUrl={context.returnUrl}
					appRegistrationContext={context}
					accuraHandoffToken={handoffToken}
					initialAccountType="user"
					showIssuerRegistrationLink={false}
				/>
			)}
		</main>
	);
}
