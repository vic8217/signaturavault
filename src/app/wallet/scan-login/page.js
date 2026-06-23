import Link from 'next/link';
import { redirect } from 'next/navigation';
import { QrCodeScanner } from '@/components/QrCodeScanner';
import {
	buildAccuraQrApprovalPath,
	parseAccuraLoginQr,
} from '@/lib/accuraQrPayload';

function firstParam(value) {
	return Array.isArray(value) ? value[0] : value;
}

export default async function WalletScanLoginPage({ searchParams }) {
	const params = await searchParams;
	const app = String(firstParam(params?.app) || '').trim();
	const challengeId = String(firstParam(params?.challengeId) || '').trim();
	const shortCode = String(firstParam(params?.shortCode) || '').trim();
	if (app || challengeId || shortCode) {
		const qr = parseAccuraLoginQr(
			`https://signatura.invalid/wallet/scan-login?app=${encodeURIComponent(app)}&challengeId=${encodeURIComponent(challengeId)}&shortCode=${encodeURIComponent(shortCode)}`,
		);
		if (qr.valid) {
			redirect(buildAccuraQrApprovalPath(qr));
		}
	}

	return (
		<div className="space-y-6">
			<section className="rounded-2xl border border-white/10 bg-white/4 p-6">
				<p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-400">
					ACCURA login
				</p>
				<h1 className="mt-3 text-3xl font-bold text-white">Scan Login QR</h1>
				<p className="mt-4 text-sm leading-6 text-slate-300">
					Scan the QR shown on the ACCURA login page. The QR only points to a
					short-lived login request and never contains your private keys or
					recovery phrase.
				</p>
			</section>

			<QrCodeScanner accuraLoginOnly />

			<Link
				href="/signatura/dashboard"
				className="inline-flex rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-white transition hover:border-red-300">
				Back to wallet
			</Link>
		</div>
	);
}
