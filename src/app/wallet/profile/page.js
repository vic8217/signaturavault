import Link from 'next/link';
import { PortalIcon } from '@/components/PortalIcon';

const securityActions = [
	{
		icon: 'identity',
		title: 'Trusted devices',
		href: '/security/devices',
		description:
			'View every browser or device trusted for your Signatura account.',
	},
	{
		icon: 'shield',
		title: 'Register device',
		href: '/security/add-device',
		description:
			'Add this phone, tablet, or browser as a new trusted device.',
	},
	{
		icon: 'lock',
		title: 'Add passkey',
		href: '/security/add-passkey',
		description:
			'Register another passkey for biometric or device PIN approval.',
	},
	{
		icon: 'document',
		title: 'Recovery codes',
		href: '/security/recovery-codes',
		description:
			'View status or rotate recovery codes after passkey re-verification.',
	},
];

export default function WalletProfilePage() {
	return (
		<div className="space-y-6">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
				<p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-400">
					Profile
				</p>
				<h1 className="mt-3 text-3xl font-bold text-white">
					Account security
				</h1>
				<p className="mt-4 text-sm leading-6 text-slate-300">
					Manage your trusted devices, passkeys, recovery codes, and other
					security settings for your wallet.
				</p>
			</section>

			<section className="grid gap-4 sm:grid-cols-2">
				{securityActions.map((action) => (
					<Link
						key={action.href}
						href={action.href}
						className="group rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-red-400 hover:bg-white/[0.06]">
						<div className="mb-4 grid h-11 w-11 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
							<PortalIcon name={action.icon} className="h-5 w-5" />
						</div>
						<h2 className="text-lg font-bold text-white group-hover:text-red-300">
							{action.title}
						</h2>
						<p className="mt-3 text-sm leading-6 text-slate-300">
							{action.description}
						</p>
					</Link>
				))}
			</section>

			<section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-sm leading-6 text-amber-100">
				Require passkey re-verification before adding trusted devices,
				rotating recovery codes, exporting documents, deleting documents, or
				changing recovery methods.
			</section>
		</div>
	);
}
