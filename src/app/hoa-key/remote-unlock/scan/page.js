import Link from 'next/link';
import { requireSession } from '@/lib/session';
import { resolveSignaturaHomePath } from '@/lib/signaturaHome';
import { QrCodeScanner } from '@/components/QrCodeScanner';

export default async function RemoteUnlockScanPage() {
	const session = await requireSession();
	const homeHref = session?.userId
		? (await resolveSignaturaHomePath()) ?? '/signatura/dashboard'
		: '/';

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-10 text-white">
			<div className="mx-auto mb-8 flex max-w-3xl items-center justify-between">
				<Link href={homeHref} className="text-sm font-bold uppercase tracking-[0.18em]">
					Signatura
				</Link>
				<span className="text-sm font-semibold text-red-200">Remote unlock</span>
			</div>

			<section className="mx-auto max-w-3xl space-y-6">
				<div className="rounded-2xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl">
					<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
						QR approval
					</p>
					<h1 className="mt-2 text-3xl font-black">Scan unlock QR</h1>
					<p className="mt-3 text-sm leading-6 text-slate-300">
						Point this phone at the QR code shown by HavenxSig, then approve the
						unlock with your trusted device passkey.
					</p>
				</div>

				<QrCodeScanner />
			</section>
		</main>
	);
}
