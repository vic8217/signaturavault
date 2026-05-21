import { PortalIcon } from '@/components/PortalIcon';

export default function WalletScanPage() {
	return (
		<div className="space-y-6">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
				<p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-400">
					QR scanner
				</p>
				<h1 className="mt-3 text-3xl font-bold text-white">
					Scan a document QR
				</h1>
				<p className="mt-4 text-sm leading-6 text-slate-300">
					Use this page to scan a Signatura QR code and verify document
					authenticity, status, issuer, and expiry.
				</p>
			</section>

			<section className="rounded-2xl border border-dashed border-red-500/40 bg-red-500/10 p-8 text-center">
				<div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-red-500/40 bg-slate-950 text-red-300">
					<PortalIcon name="scanner" className="h-8 w-8" />
				</div>
				<h2 className="mt-5 text-xl font-bold text-white">
					Camera scanner coming next
				</h2>
				<p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-300">
					The mobile scanner tab is ready. Camera permissions and QR decoding
					can be connected here without changing the wallet navigation.
				</p>
			</section>
		</div>
	);
}
