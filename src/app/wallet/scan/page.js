import { PortalIcon } from '@/components/PortalIcon';
import { QrCodeScanner } from '@/components/QrCodeScanner';

export default function WalletScanPage() {
	return (
		<div className="space-y-6">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
				<p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-400">
					QR scanner
				</p>
				<h1 className="mt-3 text-3xl font-bold text-white">
					Scan a Signatura QR
				</h1>
				<p className="mt-4 text-sm leading-6 text-slate-300">
					Scan a document verification QR or a remote unlock QR from a desktop
					browser session.
				</p>
			</section>

			<section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
				<div className="flex items-center gap-3 text-sm text-red-50">
					<PortalIcon name="scanner" className="h-5 w-5 shrink-0 text-red-300" />
					<p>
						Camera access works on HTTPS origins such as your ngrok URL. If a
						browser blocks camera QR decoding, paste the QR link below.
					</p>
				</div>
			</section>

			<QrCodeScanner />
		</div>
	);
}
