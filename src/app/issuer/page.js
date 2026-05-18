import Link from 'next/link';
import { PortalIcon } from '@/components/PortalIcon';

const issuerCards = [
	{
		icon: 'bank',
		title: 'Onboarding',
		href: '/issuer-portal/onboarding',
		description:
			'Register issuers, onboard tenant admins, and configure tenant settings.',
	},
	{
		icon: 'template',
		title: 'Template setup',
		href: '/issuer-portal/templates',
		description:
			'Create document templates for diplomas, TORs, certificates, and records.',
	},
	{
		icon: 'document',
		title: 'Issuance',
		href: '/issuer-portal/issuance',
		description:
			'Issue single documents, generate signed QR codes, or submit bulk uploads.',
	},
	{
		icon: 'shield',
		title: 'Revocation',
		href: '/issuer-portal/revocation',
		description:
			'Manage revocations, revoke documents, and publish revocation status.',
	},
	{
		icon: 'audit',
		title: 'Audit logs',
		href: '/issuer-portal/audit',
		description: 'View issuance, API, and verification audit logs per tenant.',
	},
	{
		icon: 'api',
		title: 'API credentials',
		href: '/issuer-portal/api',
		description:
			'Create API clients, generate keys, and review webhook subscriptions.',
	},
];

export default function IssuerHome() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 shadow-[0_0_80px_rgba(15,23,42,0.45)]">
				<div className="max-w-3xl">
					<p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-400">
						Issuer Portal
					</p>
					<h1 className="mt-4 text-4xl font-bold tracking-tight text-white">
						Secure tenant portal for document issuance.
					</h1>
					<p className="mt-4 text-lg leading-8 text-slate-300">
						Signatura gives each issuer a private tenant environment with
						onboarding, templates, document issuance, revocation workflows,
						audit logs, and API access.
					</p>
				</div>
			</section>

			<section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
				{issuerCards.map((card) => (
					<Link
						key={card.href}
						href={card.href}
						className="group rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition hover:border-red-400 hover:bg-white/[0.06]">
						<div className="mb-5 grid h-12 w-12 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
							<PortalIcon name={card.icon} className="h-6 w-6" />
						</div>
						<h2 className="text-xl font-bold text-white group-hover:text-red-300">
							{card.title}
						</h2>
						<p className="mt-3 text-sm leading-6 text-slate-300">
							{card.description}
						</p>
					</Link>
				))}
			</section>
		</div>
	);
}
