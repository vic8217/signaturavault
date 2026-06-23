import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AccuraQrLoginApprovalForm } from '@/components/AccuraQrLoginApprovalForm';
import { requireSession } from '@/lib/session';

function firstParam(value) {
	return Array.isArray(value) ? value[0] : value;
}

export default async function ApproveAccuraLoginPage({ searchParams }) {
	const params = await searchParams;
	const challengeId = String(firstParam(params?.challengeId) || '').trim();
	const shortCode = String(firstParam(params?.shortCode) || '').trim();
	const next = `/signatura/approve-accura-login?challengeId=${encodeURIComponent(challengeId)}&shortCode=${encodeURIComponent(shortCode)}`;
	const session = await requireSession();
	if (!session?.userId) {
		redirect(`/login?next=${encodeURIComponent(next)}`);
	}

	if (!challengeId || !shortCode) {
		return (
			<section className="rounded-2xl border border-red-500/30 bg-slate-950/90 p-6 text-white">
				<h1 className="text-2xl font-black">Invalid ACCURA login QR</h1>
				<p className="mt-3 text-sm text-slate-300">
					The login request is missing its challenge ID or short code.
				</p>
				<Link
					href="/signatura/scan-login"
					className="mt-6 inline-flex rounded-xl bg-red-500 px-5 py-3 text-sm font-bold">
					Scan Login QR
				</Link>
			</section>
		);
	}

	return (
		<AccuraQrLoginApprovalForm
			challengeId={challengeId}
			shortCode={shortCode}
		/>
	);
}
