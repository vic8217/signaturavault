'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
	Banknote,
	Bell,
	MoreHorizontal,
	ScanLine,
	WalletCards,
} from 'lucide-react';

const navItems = [
	{ label: 'Wallet', href: '/owner/wallet', icon: WalletCards },
	{ label: 'Issuers', href: '/owner/issuers', icon: Banknote },
	{ label: 'Scan', href: '/owner/scan', icon: ScanLine, primary: true },
	{ label: 'Alerts', href: '/owner/alerts', icon: Bell, badge: 8 },
	{ label: 'Others', href: '/owner/others', icon: MoreHorizontal },
];

function isActive(pathname, href) {
	if (href === '/owner/wallet') {
		return (
			pathname === '/owner' ||
			pathname === href ||
			pathname === '/signatura/dashboard'
		);
	}

	if (href === '/owner/issuers') {
		return (
			pathname === href ||
			pathname.startsWith(`${href}/`) ||
			pathname === '/signatura/documents/issuers' ||
			pathname.startsWith('/signatura/documents/issuers/')
		);
	}

	if (href === '/owner/scan') {
		return pathname === href || pathname === '/signatura/documents/scan';
	}

	if (href === '/owner/others') {
		return (
			pathname === href ||
			pathname === '/owner/profile' ||
			pathname === '/owner/activity' ||
			pathname === '/owner/security' ||
			pathname === '/signatura/settings/security' ||
			pathname.startsWith('/signatura/settings/') ||
			pathname.startsWith('/signatura/trusted-devices')
		);
	}

	return pathname === href || pathname.startsWith(`${href}/`);
}

export function WalletBottomNav() {
	const pathname = usePathname();

	return (
		<nav className="fixed inset-x-0 bottom-0 z-50 w-full overflow-visible border-t border-white/10 bg-slate-950/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.45rem)] pt-2 shadow-[0_-12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:hidden">
			<div className="mx-auto grid h-16 w-full max-w-3xl grid-cols-5 items-end gap-1">
				{navItems.map((item) => {
					const active = isActive(pathname, item.href);
					const Icon = item.icon;

					if (item.primary) {
						return (
							<Link
								key={item.href}
								href={item.href}
								aria-current={active ? 'page' : undefined}
								className="group relative grid min-h-16 place-items-center gap-1 rounded-2xl px-1 pb-1 text-[0.68rem] font-bold text-white transition"
							>
								<span
									className={`absolute -top-7 grid h-16 w-16 place-items-center rounded-full border text-white shadow-[0_18px_55px_rgba(239,68,68,0.35)] transition ${
										active
											? 'border-red-300/70 bg-red-500'
											: 'border-red-300/30 bg-red-500/90 group-hover:bg-red-500'
									}`}
								>
									<Icon className="h-7 w-7" />
								</span>
								<span className="mt-8 leading-none">Scan</span>
							</Link>
						);
					}

					return (
						<Link
							key={item.href}
							href={item.href}
							aria-current={active ? 'page' : undefined}
							className={`relative grid min-h-14 place-items-center gap-1 rounded-xl px-1 py-2 text-[0.68rem] font-bold transition ${
								active
									? 'bg-red-500 text-white'
									: 'text-slate-400 hover:bg-white/4 hover:text-white'
							}`}>
							<span className="relative">
								<Icon
									className={`h-5 w-5 ${
										active ? 'text-white' : 'text-red-300'
									}`}
								/>
								{item.badge ? (
									<span className="absolute -right-2.5 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[0.62rem] font-black leading-none text-white ring-2 ring-slate-950">
										{item.badge}
									</span>
								) : null}
							</span>
							<span className="leading-none">{item.label}</span>
						</Link>
					);
				})}
			</div>
		</nav>
	);
}
