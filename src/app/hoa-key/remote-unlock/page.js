import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { resolveSignaturaHomePath } from '@/lib/signaturaHome';
import { HoaKeyRemoteUnlockForm } from '@/components/HoaKeyRemoteUnlockForm';

function queryValue(params, key) {
	const value = params?.[key];
	return Array.isArray(value) ? value[0] || '' : value || '';
}

async function signaturaHeaderLink({ loginNext = null } = {}) {
	const session = await requireSession();
	if (session?.userId) {
		return (await resolveSignaturaHomePath()) ?? '/signatura/dashboard';
	}
	if (loginNext) {
		return `/login?next=${encodeURIComponent(loginNext)}`;
	}
	return '/';
}

export default async function HoaKeyRemoteUnlockPage({ searchParams }) {
	const params = await searchParams;
	const challengeId = queryValue(params, 'cid');
	const shortCode = queryValue(params, 'code');

	if (!challengeId || !shortCode) {
		const homeHref = await signaturaHeaderLink();
		return (
			<main className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-10 text-white">
				<div className="mx-auto mb-8 flex max-w-3xl items-center justify-between">
					<Link href={homeHref} className="text-sm font-bold uppercase tracking-[0.18em]">
						Signatura
					</Link>
					<span className="text-sm font-semibold text-red-200">Remote unlock</span>
				</div>
				<section className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl">
					<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
						QR approval
					</p>
					<h1 className="mt-2 text-3xl font-black">Scan unlock QR</h1>
					<p className="mt-3 text-sm leading-6 text-slate-300">
						Open the scanner on your phone and scan the QR code shown by
						HavenxSig to approve the browser session.
					</p>
					<Link
						href="/hoa-key/remote-unlock/scan"
						className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 sm:w-auto">
						Open QR scanner
					</Link>
				</section>
			</main>
		);
	}

	const currentPath = `/hoa-key/remote-unlock?${new URLSearchParams({
		cid: challengeId,
		code: shortCode,
	}).toString()}`;

	const session = await requireSession();
	if (!session?.userId) {
		redirect(`/login?next=${encodeURIComponent(currentPath)}`);
	}

	const homeHref = (await resolveSignaturaHomePath()) ?? '/signatura/dashboard';

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-10 text-white">
			<div className="mx-auto mb-8 flex max-w-5xl items-center justify-between">
				<Link href={homeHref} className="text-sm font-bold uppercase tracking-[0.18em]">
					Signatura
				</Link>
				<span className="text-sm font-semibold text-red-200">Remote unlock</span>
			</div>
			<HoaKeyRemoteUnlockForm
				challengeId={challengeId}
				shortCode={shortCode}
				homeHref={homeHref}
			/>
		</main>
	);
}
