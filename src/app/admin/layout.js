import Image from 'next/image';
import Link from 'next/link';
import { PortalIcon } from '@/components/PortalIcon';

const navItems = [
	['dashboard', 'Dashboard', '/admin'],
	['bank', 'Issuers', '/admin/issuers'],
	['audit', 'Analytics', '/admin/analytics'],
	['system', 'System', '/admin/system'],
];

export default function AdminLayout({ children }) {
	return (
		<div className="min-h-screen bg-[#030914] text-slate-100">
			<div className="border-b border-white/10 bg-slate-950/95 shadow-sm">
				<div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
					<Link href="/" className="flex items-center gap-3">
						<Image
							src="/signatura-logo.png"
							alt="Signatura logo"
							width={44}
							height={52}
							className="h-11 w-11 object-contain"
						/>
						<div>
							<p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-400">
								Signatura
							</p>
							<h1 className="text-2xl font-bold text-white">Dev Admin</h1>
						</div>
					</Link>
					<nav className="flex flex-wrap gap-3 text-sm font-medium text-slate-200">
						{navItems.map(([icon, label, href]) => (
							<Link
								key={href}
								className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 transition hover:border-red-400 hover:text-red-300"
								href={href}>
								<PortalIcon name={icon} className="h-4 w-4 text-red-400" />
								{label}
							</Link>
						))}
						<Link
							className="rounded-lg bg-red-500 text-white px-4 py-2 transition hover:bg-red-600"
							href="/api/auth/session">
							Sign Out
						</Link>
					</nav>
				</div>
			</div>
			<main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
		</div>
	);
}
