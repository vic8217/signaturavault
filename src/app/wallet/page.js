import Link from 'next/link';
import { Suspense } from 'react';
import { PortalIcon } from '@/components/PortalIcon';
import { RegisterTrustedDevicePrompt } from '@/components/RegisterTrustedDevicePrompt';

const walletCards = [
	{
		icon: 'document',
		title: 'My Credentials',
		href: '/signatura/documents',
		description:
			'View all your issued documents, diplomas, certificates, and credentials.',
	},
	{
		icon: 'qr',
		title: 'Shared Documents',
		href: '/signatura/documents',
		description: 'Manage documents you have shared with others using secure links.',
	},
	{
		icon: 'upload',
		title: 'Share & Export',
		href: '/signatura/documents',
		description:
			'Generate shareable QR codes or export credential proof for applications.',
	},
	{
		icon: 'audit',
		title: 'Verification History',
		href: '/signatura/documents',
		description: 'Track every time your credentials have been verified or requested.',
	},
	{
		icon: 'lock',
		title: 'Settings',
		href: '/signatura/settings',
		description: 'Manage your wallet preferences, privacy settings, and notifications.',
	},
	{
		icon: 'shield',
		title: 'Privacy & Backup',
		href: '/signatura/settings/security',
		description: 'Back up your wallet, manage recovery codes, and export all data.',
	},
];

export default function WalletHome() {
	return (
		<div className="space-y-8">
			<Suspense fallback={null}>
				<RegisterTrustedDevicePrompt />
			</Suspense>
			<section className="rounded-2xl border border-white/10 bg-white/4 p-7 shadow-[0_0_70px_rgba(15,23,42,0.42)]">
				<div className="max-w-3xl">
					<p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-400">
						Document Wallet
					</p>
					<h1 className="mt-4 text-3xl font-bold tracking-tight text-white">
						Your credentials in one place.
					</h1>
					<p className="mt-4 text-base leading-7 text-slate-300">
						Store and manage all your issued documents. Share credentials
						securely, track revocation status, and verify authenticity with
						blockchain anchors.
					</p>
				</div>
			</section>

			<section className="grid gap-4 sm:grid-cols-2">
				{walletCards.map((card) => (
					<Link
						key={card.title}
						href={card.href}
						className="group rounded-2xl border border-white/10 bg-white/4 p-5 transition hover:border-red-400 hover:bg-white/6">
						<div className="mb-4 grid h-11 w-11 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
							<PortalIcon name={card.icon} className="h-5 w-5" />
						</div>
						<h2 className="text-lg font-bold text-white group-hover:text-red-300">
							{card.title}
						</h2>
						<p className="mt-3 text-sm leading-6 text-slate-300">
							{card.description}
						</p>
					</Link>
				))}
			</section>

			<section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
				<h2 className="mb-4 text-2xl font-bold text-white">How it works</h2>
				<ol className="space-y-3 text-slate-200">
					<li className="flex gap-3">
						<span className="text-red-600 font-bold">1.</span>
						<span>Issuers send you credentials directly to your wallet.</span>
					</li>
					<li className="flex gap-3">
						<span className="text-red-600 font-bold">2.</span>
						<span>
							Generate QR codes to share credentials with employers, schools, or
							organizations.
						</span>
					</li>
					<li className="flex gap-3">
						<span className="text-red-600 font-bold">3.</span>
						<span>
							Track every verification and share permission in your audit
							history.
						</span>
					</li>
					<li className="flex gap-3">
						<span className="text-red-600 font-bold">4.</span>
						<span>
							Sensitive private fields are encrypted, and every important access
							or change is logged.
						</span>
					</li>
				</ol>
			</section>
		</div>
	);
}
