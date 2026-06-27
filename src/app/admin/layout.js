'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PortalIcon } from '@/components/PortalIcon';

const navItems = [
	['dashboard', 'Dashboard', '/admin'],
	['identity', 'Signatura IDs', '/admin/signatura-ids'],
	['bank', 'Issuers', '/admin/issuers'],
	['template', 'Digitization', '/admin/digitization'],
	['document', 'Presentations', '/admin/presentations/signatura-issuers'],
	['qr', 'Anchoring', '/admin/anchoring'],
	['audit', 'Analytics', '/admin/analytics'],
	['system', 'System', '/admin/system'],
];

const adminLogoutHref = `/api/auth/logout?redirect=${encodeURIComponent('/admin/login?next=/admin')}`;

export default function AdminLayout({ children }) {
	const pathname = usePathname();
	const [currentUser, setCurrentUser] = useState(null);
	const isAuthScreen =
		pathname === '/admin/login' ||
		pathname === '/admin/register' ||
		pathname === '/admin/setup';

	useEffect(() => {
		if (isAuthScreen) return;
		let cancelled = false;
		async function loadCurrentUser() {
			try {
				const response = await fetch('/api/auth/current-user', {
					cache: 'no-store',
				});
				const data = await response.json().catch(() => ({}));
				if (!cancelled && response.ok) {
					setCurrentUser(data.user || null);
				}
			} catch {
				if (!cancelled) setCurrentUser(null);
			}
		}
		loadCurrentUser();
		return () => {
			cancelled = true;
		};
	}, [isAuthScreen]);

	if (isAuthScreen) {
		return children;
	}

	return (
		<div className="min-h-screen bg-[#030914] text-slate-100">
			<aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-white/10 bg-slate-950 px-5 py-6 lg:block">
				<Link href="/" className="flex items-center gap-3">
					<Image
						src="/signatura-logo.png"
						alt="Signatura logo"
						width={44}
						height={52}
						className="h-11 w-auto object-contain"
					/>
					<div>
						<p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-400">
							Signatura
						</p>
						<h1 className="text-2xl font-bold text-white">System Admin</h1>
					</div>
				</Link>

				<div className="mt-6 rounded-xl border border-white/10 bg-white/4 px-4 py-3">
					<p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">
						Platform
					</p>
					<p className="mt-1 text-sm text-slate-300">
						System controls and tenant oversight
					</p>
				</div>

				<div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/8 px-4 py-3">
					<p className="text-xs font-bold uppercase tracking-[0.18em] text-red-200">
						Signed In
					</p>
					<p className="mt-2 truncate font-mono text-sm font-bold text-white">
						{currentUser?.signaturaId || 'Loading...'}
					</p>
					<p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
						{currentUser?.role || 'Admin Session'}
					</p>
				</div>

				<nav className="mt-8 grid gap-2 text-sm font-medium text-slate-300">
					{navItems.map(([icon, label, href]) => (
						<Link
							key={href}
							className="flex items-center gap-3 rounded-lg px-4 py-3 transition hover:bg-red-500/10 hover:text-red-300"
							href={href}>
							<PortalIcon name={icon} className="h-5 w-5 text-red-400" />
							{label}
						</Link>
					))}
				</nav>

				<a
					className="absolute bottom-6 left-5 right-5 rounded-lg bg-red-500 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-red-600"
					href={adminLogoutHref}>
					Sign Out
				</a>
			</aside>

			<div className="lg:pl-72">
				<header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 px-4 py-4 shadow-sm backdrop-blur lg:hidden">
					<div className="flex items-center justify-between gap-3">
						<Link href="/" className="flex items-center gap-3">
							<Image
								src="/signatura-logo.png"
								alt="Signatura logo"
								width={40}
								height={47}
								className="h-10 w-auto object-contain"
							/>
							<div>
								<p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-400">
									Signatura
								</p>
								<h1 className="text-xl font-bold text-white">Dev Admin</h1>
							</div>
						</Link>
						<a
							className="rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white"
							href={adminLogoutHref}>
							Sign Out
						</a>
					</div>
					<div className="mt-3 rounded-lg border border-red-400/20 bg-red-500/8 px-3 py-2">
						<p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-200">
							Signed In
						</p>
						<p className="mt-1 truncate font-mono text-xs font-bold text-white">
							{currentUser?.signaturaId || 'Loading...'}
						</p>
					</div>
					<nav className="mt-4 flex gap-2 overflow-x-auto pb-1 text-xs font-bold text-slate-200">
						{navItems.map(([icon, label, href]) => (
							<Link
								key={href}
								className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/4 px-3 py-2"
								href={href}>
								<PortalIcon name={icon} className="h-4 w-4 text-red-400" />
								{label}
							</Link>
						))}
					</nav>
				</header>
				<main className="w-full px-4 py-8 sm:px-6 lg:px-10">{children}</main>
			</div>
		</div>
	);
}
