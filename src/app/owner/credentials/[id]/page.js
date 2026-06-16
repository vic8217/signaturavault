import Link from 'next/link';
import { BadgeCheck, CalendarDays, ShieldCheck } from 'lucide-react';

const credentialDetails = {
	'bsit-university-example': {
		title: 'Bachelor of Science in IT',
		issuer: 'University of Example',
		date: 'Apr 18, 2026',
	},
	'prc-professional-license': {
		title: 'PRC Professional License',
		issuer: 'Professional Regulation Commission',
		date: 'Feb 9, 2026',
	},
	'national-id': {
		title: 'National ID',
		issuer: 'Republic of the Philippines',
		date: 'Nov 21, 2025',
	},
};

export default async function OwnerCredentialDetailPage({ params }) {
	const { id } = await params;
	const detail = credentialDetails[id] || {
		title: 'Verified Credential',
		issuer: 'Verified issuer',
		date: 'Recently issued',
	};

	return (
		<div className="mx-auto w-full max-w-md space-y-5 md:max-w-2xl">
			<section className="overflow-hidden rounded-[1.7rem] border border-red-500/30 bg-[radial-gradient(circle_at_20%_0%,rgba(239,68,68,0.26),transparent_34%),linear-gradient(160deg,#111827,#030712_68%)] p-6 shadow-[0_28px_80px_rgba(239,68,68,0.12)]">
				<div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-500 text-white">
					<BadgeCheck className="h-7 w-7" />
				</div>
				<h1 className="mt-6 text-2xl font-black text-white">{detail.title}</h1>
				<p className="mt-2 text-sm font-semibold text-slate-300">{detail.issuer}</p>
				<div className="mt-6 grid gap-3">
					<div className="flex min-h-12 items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4">
						<span className="flex items-center gap-2 text-sm font-bold text-slate-200">
							<CalendarDays className="h-4 w-4 text-red-300" />
							Date issued
						</span>
						<span className="text-sm text-white">{detail.date}</span>
					</div>
					<div className="flex min-h-12 items-center justify-between rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4">
						<span className="flex items-center gap-2 text-sm font-bold text-emerald-50">
							<ShieldCheck className="h-4 w-4" />
							Status
						</span>
						<span className="text-sm font-black text-emerald-100">Verified</span>
					</div>
				</div>
			</section>

			<Link
				href="/owner"
				className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-red-500 px-4 text-sm font-bold text-white transition hover:bg-red-400">
				Back to Wallet
			</Link>
		</div>
	);
}
