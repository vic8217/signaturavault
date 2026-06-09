import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { HoaKeySetupForm } from '@/components/HoaKeySetupForm';

function queryValue(params, key) {
	const value = params?.[key];
	return Array.isArray(value) ? value[0] || '' : value || '';
}

export default async function HoaKeySetupPage({ searchParams }) {
	const params = await searchParams;
	const hoaId = queryValue(params, 'hoaId') || queryValue(params, 'tenantId');
	const tenantId = queryValue(params, 'tenantId') || hoaId;
	const recordType = queryValue(params, 'recordType') || 'HOMEOWNER';
	const returnTo = queryValue(params, 'returnTo');
	const currentPath = `/hoa-key/setup?${new URLSearchParams({
		hoaId,
		tenantId,
		recordType,
		returnTo,
	}).toString()}`;

	const session = await requireSession();
	if (!session?.userId) {
		redirect(`/login?next=${encodeURIComponent(currentPath)}`);
	}

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-10 text-white">
			<div className="mx-auto mb-8 flex max-w-5xl items-center justify-between">
				<Link href="/" className="text-sm font-bold uppercase tracking-[0.18em]">
					Signatura
				</Link>
				<span className="text-sm font-semibold text-red-200">HOA key setup</span>
			</div>
			<HoaKeySetupForm hoaId={hoaId} tenantId={tenantId} recordType={recordType} returnTo={returnTo} />
		</main>
	);
}
