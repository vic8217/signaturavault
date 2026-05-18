import Image from 'next/image';
import Link from 'next/link';
import { PortalIcon } from '@/components/PortalIcon';

export default function WalletLayout({ children }) {
	return (
		<div className="min-h-screen bg-[#030914] text-slate-100">
			<div className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 shadow-sm backdrop-blur">
				<div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-3">
					<Link href="/" className="flex items-center gap-3">
						<Image
							src="/signatura-logo.png"
							alt="Signatura logo"
							width={40}
							height={47}
							className="h-10 w-10 object-contain"
						/>
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-400">
								Signatura
							</p>
							<h1 className="text-xl font-bold text-white">Wallet</h1>
						</div>
					</Link>
					<nav className="flex gap-2 text-xs font-bold text-slate-200">
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
							className="rounded-lg bg-red-500 px-3 py-2 text-white transition hover:bg-red-600"
							href="/api/auth/session">
							Sign Out
						</Link>
					</nav>
				</div>
			</div>
			<main className="mx-auto max-w-xl px-4 py-6">{children}</main>
		</div>
	);
}
