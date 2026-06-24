import Link from 'next/link';
import { RegisterPasskeyForm } from '@/components/RegisterPasskeyForm';
import { normalizeLoginNextPath } from '@/lib/portalRoutes';

export default async function AdminRegisterPage({ searchParams }) {
	const params = await searchParams;
	const requestedNext = params?.next || '';
	const nextPath = normalizeLoginNextPath(
		typeof requestedNext === 'string' && requestedNext.startsWith('/')
			? requestedNext
			: '/admin',
	);

	return (
		<div className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-10">
			<div className="mx-auto mb-8 flex max-w-5xl items-center justify-between text-white">
				<Link href="/" className="text-sm font-bold uppercase tracking-[0.18em]">
					Signatura
				</Link>
				<Link
					href="/admin/login?next=/admin"
					className="text-sm font-semibold text-red-200">
					Admin sign-in
				</Link>
			</div>
			<RegisterPasskeyForm
				nextPath={nextPath}
				initialAccountType="admin"
				setupMode=""
			/>
		</div>
	);
}
