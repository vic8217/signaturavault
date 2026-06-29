import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';
import { accuraHandoffFromSearchParams } from '@/lib/accuraRegistrationEntry';

export const metadata = {
	title: 'Install Signatura App',
	description: 'Secure Zero Trust Level 2 access from your phone.',
};

function firstParam(value) {
	return Array.isArray(value) ? value[0] : value;
}

export default async function AppInstallPage({ searchParams }) {
	const params = await searchParams;
	const accura = accuraHandoffFromSearchParams({
		handoffToken: firstParam(params?.handoffToken),
		challengeId: firstParam(params?.challengeId) || firstParam(params?.cid),
		handoffId: firstParam(params?.handoffId),
		app: firstParam(params?.app),
		flowType: firstParam(params?.flowType),
		originDevice: firstParam(params?.originDevice),
		requestedRole: firstParam(params?.requestedRole),
		returnUrl: firstParam(params?.returnUrl),
		source: firstParam(params?.source),
		sourceApp: firstParam(params?.sourceApp),
	});

	return (
		<main className="min-h-screen overflow-hidden bg-[#020817] text-white">
			<div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_82%_12%,rgba(239,68,68,0.22),transparent_30%),radial-gradient(circle_at_8%_88%,rgba(30,64,120,0.18),transparent_32%),linear-gradient(180deg,#020817_0%,#050b16_52%,#020817_100%)]" />
			<div className="pointer-events-none fixed inset-0 bg-[linear-gradient(135deg,transparent_0%,rgba(255,255,255,0.04)_48%,transparent_49%)] opacity-20" />
			<div className="relative">
				<PwaInstallPrompt
					accuraHandoffToken={accura.handoffToken}
					accuraRegisterPath={accura.registerPath}
					accuraLoginPath={accura.loginPath}
				/>
			</div>
		</main>
	);
}
