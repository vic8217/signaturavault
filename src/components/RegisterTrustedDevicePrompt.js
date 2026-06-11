'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

export function RegisterTrustedDevicePrompt() {
	const searchParams = useSearchParams();
	const shouldPrompt = searchParams.get('registerTrustedDevice') === '1';
	const signaturaId = searchParams.get('signaturaId') || '';

	if (!shouldPrompt) return null;

	const registerHref = signaturaId
		? `/register?next=${encodeURIComponent('/signatura/dashboard')}&signaturaId=${encodeURIComponent(signaturaId)}&setup=device`
		: '/signatura/trusted-devices/add?next=%2Fsignatura%2Fdashboard';

	return (
		<section className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-sm text-emerald-50">
			<p className="font-bold">Signed in with a trusted device</p>
			<p className="mt-2 leading-6 text-emerald-50/90">
				You can register this browser as a new trusted device so passkey login works
				here next time.
			</p>
			<Link
				href={registerHref}
				className="mt-4 inline-flex rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-400">
				Register this browser
			</Link>
		</section>
	);
}
