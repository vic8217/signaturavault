import { PwaInstallPrompt } from '@/components/PwaInstallPrompt';

export const metadata = {
	title: 'Install Signatura App',
	description: 'Secure Zero Trust Level 2 access from your phone.',
};

export default function AppInstallPage() {
	return (
		<main className="min-h-screen overflow-hidden bg-[#020817] text-white">
			<div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_82%_12%,rgba(239,68,68,0.22),transparent_30%),radial-gradient(circle_at_8%_88%,rgba(30,64,120,0.18),transparent_32%),linear-gradient(180deg,#020817_0%,#050b16_52%,#020817_100%)]" />
			<div className="pointer-events-none fixed inset-0 bg-[linear-gradient(135deg,transparent_0%,rgba(255,255,255,0.04)_48%,transparent_49%)] opacity-20" />
			<div className="relative">
				<PwaInstallPrompt />
			</div>
		</main>
	);
}
