import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppApprovalForm } from '@/components/AppApprovalForm';
import { requireSession } from '@/lib/session';
import {
	normalizeApp,
	normalizeChallengeId,
	normalizeFlowType,
	normalizeRole,
} from '@/lib/signaturaAppApprovalQr';

function firstParam(value) {
	return Array.isArray(value) ? value[0] : value;
}

function callbackParam(value) {
	const raw = String(value || '').trim();
	if (!raw) return '';
	try {
		return new URL(raw).toString();
	} catch {
		return '';
	}
}

export default async function AppApprovalPage({ searchParams }) {
	const params = await searchParams;
	const challengeId = normalizeChallengeId(firstParam(params?.challengeId));
	const app = normalizeApp(firstParam(params?.app));
	const requestedRole = normalizeRole(
		firstParam(params?.requestedRole) || firstParam(params?.role),
	);
	const flowType = normalizeFlowType(firstParam(params?.flowType));
	const callbackUrl = callbackParam(firstParam(params?.callbackUrl));
	const currentPath = `/app-approval?${new URLSearchParams({
		challengeId,
		app,
		requestedRole,
		flowType,
		...(callbackUrl ? { callbackUrl } : {}),
	}).toString()}`;
	const session = await requireSession();
	const hasUniversalIdentity =
		session?.userId &&
		session.accountStatus === 'active' &&
		Number(session.trustLevel || 0) >= 2 &&
		String(session.signaturaId || '').startsWith('SIG-U-');

	if (!challengeId || app !== 'ACCURA' || !requestedRole || !callbackUrl) {
		return (
			<main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
				<section className="mx-auto max-w-2xl rounded-2xl border border-red-500/30 bg-slate-950/90 p-6">
					<h1 className="text-2xl font-black">Invalid approval request</h1>
					<p className="mt-3 text-sm text-slate-300">
						This QR code is missing required Signatura app approval fields.
					</p>
				</section>
			</main>
		);
	}

	if (!hasUniversalIdentity) {
		redirect(`/register?next=${encodeURIComponent(currentPath)}`);
	}

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-10">
			<div className="mx-auto mb-8 max-w-5xl text-white">
				<Link href="/" className="text-sm font-bold uppercase tracking-[0.18em]">
					Signatura
				</Link>
			</div>
			<AppApprovalForm
				challengeId={challengeId}
				app={app}
				requestedRole={requestedRole}
				flowType={flowType}
				callbackUrl={callbackUrl}
				signaturaId={session.signaturaId}
			/>
		</main>
	);
}
