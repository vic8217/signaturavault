import Image from 'next/image';
import Link from 'next/link';
import { PortalIcon } from '@/components/PortalIcon';
import { WalletBottomNav } from '@/components/WalletBottomNav';

export default function WalletLayout({ children }) {
	return (
		<div className="min-h-screen bg-[#030914] text-slate-100">
			<div className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 shadow-sm backdrop-blur">
				<div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
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
							<h1 className="text-xl font-bold text-white">Wallet</h1>
						</div>
					</Link>
					<nav className="hidden gap-2 text-xs font-bold text-slate-200 lg:flex">
						<Link
							className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 transition hover:border-red-400"
							href="/wallet">
							<PortalIcon name="identity" className="h-4 w-4 text-red-400" />
							Home
						</Link>
						<Link
							className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 transition hover:border-red-400"
							href="/wallet/settings">
							<PortalIcon name="lock" className="h-4 w-4 text-red-400" />
							Settings
						</Link>
						<Link
							className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 transition hover:border-red-400"
							href="/wallet/profile">
							<PortalIcon name="identity" className="h-4 w-4 text-red-400" />
							Profile
						</Link>
						<Link
							className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 transition hover:border-red-400"
							href="/wallet/issuers">
							<PortalIcon name="bank" className="h-4 w-4 text-red-400" />
							Issuers
						</Link>
						<a
							className="rounded-lg bg-red-500 px-3 py-2 text-white transition hover:bg-red-600"
							href="/api/auth/session">
							Sign Out
						</a>
					</nav>
				</div>
			</div>
			<main className="mx-auto max-w-5xl px-4 pb-28 pt-6 lg:pb-6">
				{children}
			</main>
			<WalletBottomNav />
		</div>
	);
}
