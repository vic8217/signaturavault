import Link from 'next/link';
import {
	Activity,
	BadgeCheck,
	CircleHelp,
	FileClock,
	FileText,
	LockKeyhole,
	LogOut,
	Settings,
	UserRound,
} from 'lucide-react';

const profile = {
	name: 'Victor Santos',
	signaturaId: 'SIG-U-8FD2-A91C',
	initials: 'VS',
};

const groups = [
	{
		label: 'Activity',
		items: [
			{
				title: 'Shared Documents',
				detail: 'View documents you have shared',
				href: '/owner/activity',
				icon: FileText,
			},
			{
				title: 'Requested Documents',
				detail: 'Status summary of your requests',
				href: '/owner/activity',
				icon: FileClock,
			},
			{
				title: 'Verification History',
				detail: 'View your document verifications',
				href: '/owner/activity',
				icon: BadgeCheck,
			},
			{
				title: 'Activity Logs',
				detail: 'Recent account activities',
				href: '/owner/activity',
				icon: Activity,
			},
		],
	},
	{
		label: 'Settings & Support',
		items: [
			{
				title: 'Account Settings',
				detail: 'Manage your profile and preferences',
				href: '/owner/profile',
				icon: Settings,
			},
			{
				title: 'Security',
				detail: 'Passkeys, trusted devices, backup',
				href: '/owner/security',
				icon: LockKeyhole,
			},
			{
				title: 'Help & Support',
				detail: 'FAQs and contact support',
				href: '/contact',
				icon: CircleHelp,
			},
			{
				title: 'About Signatura',
				detail: 'App version and information',
				href: '/security',
				icon: UserRound,
			},
		],
	},
];

export default function OwnerOthersPage() {
	return (
		<div className="mx-auto w-full max-w-md space-y-5 md:max-w-2xl">
			<header>
				<p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">
					Signatura
				</p>
				<h1 className="mt-2 text-2xl font-black text-white">Others</h1>
			</header>

			<Link
				href="/owner/profile"
				className="flex min-h-20 items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-red-400/50">
				<span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-red-300/35 bg-red-500/10 text-lg font-black text-white">
					{profile.initials}
				</span>
				<span className="min-w-0 flex-1">
					<span className="block truncate text-base font-black text-white">
						{profile.name}
					</span>
					<span className="mt-1 block truncate font-mono text-xs text-slate-400">
						{profile.signaturaId}
					</span>
					<span className="mt-2 inline-flex rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2 py-1 text-[0.65rem] font-bold text-emerald-100">
						Trusted Device Active
					</span>
				</span>
				<span className="text-slate-500">&rsaquo;</span>
			</Link>

			{groups.map((group) => (
				<section key={group.label} className="space-y-2">
					<h2 className="px-1 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
						{group.label}
					</h2>
					<div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
						{group.items.map((item, index) => {
							const Icon = item.icon;
							return (
								<Link
									key={item.title}
									href={item.href}
									className={`flex min-h-16 items-center gap-3 p-4 transition hover:bg-white/[0.04] ${
										index === 0 ? '' : 'border-t border-white/10'
									}`}>
									<span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-slate-950/70 text-red-200">
										<Icon className="h-4 w-4" />
									</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm font-black text-white">
											{item.title}
										</span>
										<span className="mt-1 block truncate text-xs text-slate-400">
											{item.detail}
										</span>
									</span>
									<span className="text-slate-500">&rsaquo;</span>
								</Link>
							);
						})}
					</div>
				</section>
			))}

			<section className="space-y-2">
				<h2 className="px-1 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
					Session
				</h2>
				<a
					href="/api/auth/logout"
					className="flex min-h-16 items-center gap-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-50 transition hover:border-red-300/60 hover:bg-red-500/15">
					<span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-red-300/30 bg-red-500/15 text-red-100">
						<LogOut className="h-4 w-4" />
					</span>
					<span className="min-w-0 flex-1">
						<span className="block text-sm font-black text-white">
							Sign out
						</span>
						<span className="mt-1 block text-xs text-red-100/80">
							End this trusted device session
						</span>
					</span>
					<span className="text-red-100/70">&rsaquo;</span>
				</a>
			</section>
		</div>
	);
}
