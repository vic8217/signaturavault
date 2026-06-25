import Link from 'next/link';
import { IssuerActivationForm } from '@/components/IssuerActivationForm';
import { requireSession } from '@/lib/session';

export default async function IssuerActivationPage({ searchParams }) {
	const params = await searchParams;
	const token = params?.token || '';
	const session = await requireSession();

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-10">
			<div className="mx-auto mb-8 flex max-w-5xl items-center justify-between text-white">
				<Link href="/" className="text-sm font-bold uppercase tracking-[0.18em]">
					Signatura
				</Link>
				<Link href="/login" className="text-sm font-semibold text-red-200">
					Login
				</Link>
			</div>
			<IssuerActivationForm
				token={token}
				isSignedIn={Boolean(session?.userId)}
				signedInSignaturaId={session?.signaturaId || ''}
			/>
		</main>
	);
}
