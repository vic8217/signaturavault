import Link from 'next/link';
import { LoginPasskeyForm } from '@/components/LoginPasskeyForm';

export default async function LoginPage({ searchParams }) {
	const params = await searchParams;
	const requestedNext = params?.next || '';
	const nextPath =
		typeof requestedNext === 'string' && requestedNext.startsWith('/')
			? requestedNext
			: '/wallet';

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_80%_10%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-10">
			<div className="mx-auto mb-8 flex max-w-5xl items-center text-white">
				<Link href="/" className="text-sm font-bold uppercase tracking-[0.18em]">
					Signatura
				</Link>
			</div>
			<LoginPasskeyForm nextPath={nextPath} />
		</main>
	);
}
