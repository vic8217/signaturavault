import Link from 'next/link';
import Image from 'next/image';
import { LoginPasskeyForm } from '@/components/LoginPasskeyForm';
import { externalReturnUrlFromParams } from '@/lib/externalReturnUrl';
import { normalizeLoginNextPath } from '@/lib/portalRoutes';
import { registrationContextFromParams } from '@/lib/registrationSource';

export default async function LoginPage({ searchParams }) {
	const params = await searchParams;
	const requestedNext = params?.next || '';
	const externalReturnUrl = externalReturnUrlFromParams(params);
	const registrationContext = registrationContextFromParams(params);
	const nextPath = normalizeLoginNextPath(
		typeof requestedNext === 'string' && requestedNext.startsWith('/')
			? requestedNext
			: '/signatura/dashboard',
	);

	return (
		<main className="relative min-h-screen overflow-x-hidden bg-[#02070d] px-3 py-8 text-white sm:px-6 lg:px-8">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_12%,rgba(255,47,47,0.28),transparent_34%),radial-gradient(circle_at_8%_88%,rgba(20,68,97,0.22),transparent_32%),linear-gradient(145deg,#01050a_0%,#06101a_46%,#08070d_100%)]" />
			<div className="pointer-events-none absolute -right-28 top-2 h-96 w-96 rounded-full border border-red-500/10 opacity-70 shadow-[0_0_120px_rgba(239,68,68,0.18)]" />
			<div className="pointer-events-none absolute -right-20 top-20 h-72 w-72 rounded-full border border-red-500/10 opacity-60" />
			<div className="pointer-events-none absolute -bottom-36 -left-28 h-96 w-96 rounded-full border border-red-500/10 opacity-50" />

			<div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full min-w-0 max-w-5xl flex-col">
				<div className="hidden lg:flex items-center">
					<Link href="/" className="text-sm font-bold uppercase text-white ">
						Signatura
					</Link>
				</div>

				<section className="flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-8 py-7 sm:gap-10 lg:py-10">
					<div className="text-center">
						<Image
							src="/signatura-logo.png"
							alt="Signatura"
							width={184}
							height={184}
							priority
							className="mx-auto h-32 w-32 object-contain drop-shadow-[0_22px_42px_rgba(0,0,0,0.45)] sm:h-40 sm:w-40"
						/>
						<h1 className="mt-5 text-3xl font-black uppercase text-white sm:text-4xl">
							Signatura
						</h1>
						<p className="mt-2 text-sm font-bold uppercase text-red-400 sm:text-base">
							Zero Trust Level 2 Sign-In
						</p>
					</div>

					<LoginPasskeyForm
						nextPath={nextPath}
						externalReturnUrl={externalReturnUrl}
						appRegistrationContext={registrationContext}
					/>
				</section>
			</div>
		</main>
	);
}
