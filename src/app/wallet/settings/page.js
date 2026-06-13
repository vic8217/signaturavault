import Link from 'next/link';
import { PortalIcon } from '@/components/PortalIcon';

const securityLinks = [
	{
		icon: 'shield',
		title: 'Trusted devices',
		href: '/signatura/trusted-devices',
		description: 'View and manage browsers and devices trusted for sign-in.',
	},
	{
		icon: 'identity',
		title: 'Register device',
		href: '/signatura/trusted-devices/add',
		description: 'Add this phone, tablet, or browser as a trusted device.',
	},
	{
		icon: 'lock',
		title: 'Recovery codes',
		href: '/signatura/settings/recovery-codes',
		description: 'Rotate recovery codes after passkey re-verification.',
	},
	{
		icon: 'identity',
		title: 'Account security',
		href: '/signatura/settings/security',
		description: 'Open the full security hub for passkeys and recovery.',
	},
];

export default function WalletSettings() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/4 p-7 shadow-[0_0_70px_rgba(15,23,42,0.42)]">
				<div className="mb-5 grid h-12 w-12 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
					<PortalIcon name="lock" className="h-6 w-6" />
				</div>
				<h1 className="text-3xl font-bold text-white">Owner settings</h1>
				<p className="mt-4 text-slate-300">
					Manage wallet preferences, trusted devices, and account security.
				</p>
			</section>

			<section className="grid gap-4 sm:grid-cols-2">
				{securityLinks.map((link) => (
					<Link
						key={link.href}
						href={link.href}
						className="group rounded-2xl border border-white/10 bg-white/4 p-5 transition hover:border-red-400 hover:bg-white/6">
						<div className="mb-4 grid h-11 w-11 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
							<PortalIcon name={link.icon} className="h-5 w-5" />
						</div>
						<h2 className="text-lg font-bold text-white group-hover:text-red-300">
							{link.title}
						</h2>
						<p className="mt-3 text-sm leading-6 text-slate-300">
							{link.description}
						</p>
					</Link>
				))}
			</section>

			<div className="max-w-2xl rounded-2xl border border-white/10 bg-white/4 p-8">
				<h2 className="mb-6 text-xl font-bold text-white">Privacy & sharing</h2>
				<div className="space-y-4">
					<label className="flex cursor-pointer items-center gap-3">
						<input
							type="checkbox"
							defaultChecked
							className="h-4 w-4 rounded border-slate-600 accent-red-500"
						/>
						<span className="text-slate-200">
							Allow automatic credential storage
						</span>
					</label>
					<label className="flex cursor-pointer items-center gap-3">
						<input
							type="checkbox"
							defaultChecked
							className="h-4 w-4 rounded border-slate-600 accent-red-500"
						/>
						<span className="text-slate-200">
							Notify when credentials are verified
						</span>
					</label>
					<label className="flex cursor-pointer items-center gap-3">
						<input
							type="checkbox"
							className="h-4 w-4 rounded border-slate-600 accent-red-500"
						/>
						<span className="text-slate-200">
							Allow analytics on credential usage
						</span>
					</label>
				</div>
			</div>
		</div>
	);
}
