import Link from 'next/link';
import { RegisterPasskeyForm } from '@/components/RegisterPasskeyForm';
import { AccuraOnboardingLinkForm } from '@/components/AccuraOnboardingLinkForm';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
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

async function existingReadyIdentity() {
	const session = await requireSession();
	if (
		!session?.userId ||
		session.accountStatus !== 'active' ||
		Number(session.trustLevel || 0) < 2 ||
		!String(session.signaturaId || '').startsWith('SIG-U-')
	) {
		return null;
	}

	const [recoveryPhraseCount, trustedDeviceCount] = await Promise.all([
		prisma.recoveryCode.count({ where: { userId: session.userId } }),
		prisma.trustedDevice.count({
			where: {
				userId: session.userId,
				isTrusted: true,
				removedAt: null,
				status: 'active',
			},
		}),
	]);

	if (recoveryPhraseCount === 0 || trustedDeviceCount === 0) return null;

	return {
		userId: session.userId,
		signaturaId: session.signaturaId,
	};
}

async function ensureRegistrationChallenge(context) {
	if (!context?.tokenId) return;
	const challengeId = context.challengeId || context.requestId || context.tokenId;
	const existingChallenge = await prisma.accuraRegistrationHandoff.findFirst({
		where: {
			OR: [{ tokenId: context.tokenId }, { challengeId }],
		},
		orderBy: { createdAt: 'desc' },
	});

	if (existingChallenge) {
		await prisma.accuraRegistrationHandoff.update({
			where: { id: existingChallenge.id },
			data: {
				challengeId,
				tokenId: context.tokenId,
				originDevice: context.originDevice || 'desktop',
				flowType: context.flowType || 'cross_device_qr',
			},
		});
		console.info('[signatura.accura.registration.challenge.scanned]', {
			challengeId,
			tokenId: context.tokenId,
			status: existingChallenge.status,
			flowType: context.flowType || 'cross_device_qr',
			originDevice: context.originDevice || 'desktop',
		});
		return;
	}

	await prisma.accuraRegistrationHandoff.create({
		data: {
			tokenId: context.tokenId,
			challengeId,
			registrationKeyId: context.registrationKeyId,
			companyId: context.companyId,
			companyCode: context.companyCode,
			roleCode: context.rolePrefix,
			returnUrl: context.returnUrl,
			originDevice: context.originDevice || 'desktop',
			flowType: context.flowType || 'cross_device_qr',
			status: 'CLAIMED',
			expiresAt: new Date(context.expiresAt),
		},
	});
	console.info('[signatura.accura.registration.challenge.created]', {
		challengeId,
		tokenId: context.tokenId,
		flowType: context.flowType || 'cross_device_qr',
		originDevice: context.originDevice || 'desktop',
	});
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
	const externalChallengeId = String(
		firstParam(params?.challengeId) ||
			firstParam(params?.cid) ||
			firstParam(params?.handoffId) ||
			'',
	).trim();
	const baseContext = verified.valid
		? accuraRegistrationContextForForm(verified.context)
		: null;
	const context = baseContext
		? {
				...baseContext,
				challengeId:
					externalChallengeId ||
					baseContext.challengeId ||
					baseContext.requestId ||
					baseContext.tokenId,
			}
		: null;
	const nextPath = normalizeLoginNextPath(
		String(firstParam(params?.next) || '/signatura/dashboard'),
	);
	const readyIdentity = context ? await existingReadyIdentity() : null;

	if (verified.valid && verified.context) {
		await ensureRegistrationChallenge(context);
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
			) : readyIdentity ? (
				<AccuraOnboardingLinkForm
					accuraHandoffToken={handoffToken}
					appRegistrationContext={{
						...context,
						mode: 'link',
						linkSignaturaId: readyIdentity.signaturaId,
					}}
				/>
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
