import Link from 'next/link';
import { RegisterPasskeyForm } from '@/components/RegisterPasskeyForm';
import { normalizeLoginNextPath } from '@/lib/portalRoutes';

export default async function RegisterPage({ searchParams }) {
	const params = await searchParams;
	const requestedNext = params?.next || '';
	const requestedSignaturaId = params?.signaturaId || '';
	const setupMode = params?.setup === 'device' ? 'device' : '';
	const nextPath = normalizeLoginNextPath(
		typeof requestedNext === 'string' && requestedNext.startsWith('/')
			? requestedNext
			: '/signatura/dashboard',
	);
	const initialSignaturaId =
		typeof requestedSignaturaId === 'string' ? requestedSignaturaId : '';

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-10">
			<div className="mx-auto mb-8 max-w-5xl text-white">
				<Link href="/" className="text-sm font-bold uppercase tracking-[0.18em]">
					Signatura
				</Link>
			</div>
			<RegisterPasskeyForm
				nextPath={nextPath}
				initialSignaturaId={initialSignaturaId}
				setupMode={setupMode}
			/>
		</main>
	);
}
