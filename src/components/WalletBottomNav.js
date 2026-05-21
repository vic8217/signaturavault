'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PortalIcon } from '@/components/PortalIcon';

const navItems = [
	{ label: 'Main', href: '/wallet', icon: 'dashboard' },
	{ label: 'Wallet', href: '/wallet/credentials', icon: 'document' },
	{ label: 'Scan', href: '/wallet/scan', icon: 'scanner' },
	{ label: 'Issuers', href: '/wallet/issuers', icon: 'bank' },
	{ label: 'Others', href: '/wallet/profile', icon: 'more' },
];

function isActive(pathname, href) {
	if (href === '/wallet') {
		return pathname === '/wallet';
	}

	if (href === '/wallet/profile') {
		return (
			pathname === href ||
			pathname === '/wallet/settings' ||
			pathname.startsWith('/security/')
		);
	}

	return pathname === href || pathname.startsWith(`${href}/`);
}

export function WalletBottomNav() {
	const pathname = usePathname();

	return (
		<nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-slate-950/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.45rem)] pt-2 shadow-[0_-12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:hidden">
			<div className="mx-auto grid max-w-3xl grid-cols-5 gap-1">
				{navItems.map((item) => {
					const active = isActive(pathname, item.href);

					return (
						<Link
							key={item.href}
							href={item.href}
							aria-current={active ? 'page' : undefined}
							className={`grid min-h-14 place-items-center gap-1 rounded-xl px-1 py-2 text-[0.68rem] font-bold transition ${
								active
									? 'bg-red-500 text-white'
									: 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
							}`}>
							<PortalIcon
								name={item.icon}
								className={`h-5 w-5 ${active ? 'text-white' : 'text-red-300'}`}
							/>
							<span className="leading-none">{item.label}</span>
						</Link>
					);
				})}
			</div>
		</nav>
	);
}
