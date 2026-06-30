import Image from 'next/image';
import Link from 'next/link';
import { PortalIcon } from '@/components/PortalIcon';
import { WalletBottomNav } from '@/components/WalletBottomNav';

export default function WalletLayout({ children }) {
	return (
		<div className="min-h-screen w-full overflow-x-hidden bg-[#030914] text-slate-100">
			<div className="hidden w-full border-b border-white/10 bg-slate-950/95 shadow-sm backdrop-blur lg:sticky lg:top-0 lg:z-40 lg:block">
				<div className="mx-auto grid w-full max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-4">
					<div className="hidden lg:block" />

					<nav className="hidden justify-self-end gap-2 text-xs font-bold text-slate-200 lg:flex">
						<Link
							className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/4 px-3 py-2 transition hover:border-red-400"
							href="/owner/wallet">
							<PortalIcon name="document" className="h-4 w-4 text-red-400" />
							Wallet
						</Link>
						<Link
							className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/4 px-3 py-2 transition hover:border-red-400"
							href="/owner/issuers">
							<PortalIcon name="bank" className="h-4 w-4 text-red-400" />
							Issuers
						</Link>
						<Link
							className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/4 px-3 py-2 transition hover:border-red-400"
							href="/owner/scan">
							<PortalIcon name="scanner" className="h-4 w-4 text-red-400" />
							Scan
						</Link>
						<Link
							className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/4 px-3 py-2 transition hover:border-red-400"
							href="/owner/alerts">
							<PortalIcon name="audit" className="h-4 w-4 text-red-400" />
							Alerts
						</Link>
						<Link
							className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/4 px-3 py-2 transition hover:border-red-400"
							href="/owner/others">
							<PortalIcon name="more" className="h-4 w-4 text-red-400" />
							Others
						</Link>
						<a
							className="rounded-lg bg-red-500 px-3 py-2 text-white transition hover:bg-red-600"
							href="/api/auth/logout">
							Sign Out
						</a>
					</nav>
				</div>
			</div>
			<main className="mx-auto w-full max-w-5xl overflow-x-hidden px-3 pb-28 pt-6 sm:px-4 lg:pb-6">
				{children}
			</main>
			<WalletBottomNav />
		</div>
	);
}
