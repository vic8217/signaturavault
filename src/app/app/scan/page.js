import Link from 'next/link';
import { QrCodeScanner } from '@/components/QrCodeScanner';

export const metadata = {
	title: 'Signatura QR Scanner',
	description: 'Scan Signatura QR codes from the installed PWA.',
};

export default function AppScanPage() {
	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-10 text-white">
			<div className="mx-auto mb-8 flex max-w-3xl items-center justify-between">
				<Link href="/app" className="text-sm font-bold uppercase tracking-[0.18em]">
					Signatura
				</Link>
				<span className="text-sm font-semibold text-red-200">PWA scanner</span>
			</div>

			<section className="mx-auto max-w-3xl space-y-6">
				<div className="rounded-lg border border-white/10 bg-slate-950/90 p-6 shadow-2xl">
					<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
						Signatura scanner
					</p>
					<h1 className="mt-2 text-3xl font-black">Scan QR</h1>
					<p className="mt-3 text-sm leading-6 text-slate-300">
						Available even when signed out. Login approval still requires the
						matching Signatura account, trusted device, and passkey.
					</p>
				</div>

				<QrCodeScanner />
			</section>
		</main>
	);
}
