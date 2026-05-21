import Link from 'next/link';
import { RecoveryCodeLoginForm } from '@/components/RecoveryCodeLoginForm';

export default async function RecoveryCodePage({ searchParams }) {
	const params = await searchParams;
	const email = typeof params?.email === 'string' ? params.email : '';
	const nextPath =
		typeof params?.next === 'string' && params.next.startsWith('/')
			? params.next
			: '/wallet';

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_80%_10%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-10 text-white">
			<div className="mx-auto mb-8 flex max-w-5xl items-center justify-between">
				<Link href="/" className="text-sm font-bold uppercase tracking-[0.18em]">
					Signatura
				</Link>
				<Link
					href={`/account-recovery?next=${encodeURIComponent(nextPath)}${
						email ? `&email=${encodeURIComponent(email)}` : ''
					}`}
					className="text-sm font-semibold text-red-200">
					Back to recovery
				</Link>
			</div>

			<section className="mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl">
				<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
					Recovery code
				</p>
				<h1 className="mt-2 text-3xl font-black">
					Recover access securely
				</h1>
				<p className="mt-4 text-sm leading-6 text-slate-300">
					Enter one unused recovery code from onboarding. The code is
					single-use. After it is accepted, register this device with a new
					passkey immediately.
				</p>
				<div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
					After this code is verified, Signatura will take you to add a new
					passkey. Fresh recovery codes will be shown after the new passkey is
					registered.
				</div>

				<RecoveryCodeLoginForm initialEmail={email} nextPath={nextPath} />
			</section>
		</main>
	);
}
