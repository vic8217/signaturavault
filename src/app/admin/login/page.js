import Image from 'next/image';
import Link from 'next/link';
import { LoginPasskeyForm } from '@/components/LoginPasskeyForm';
import { normalizeLoginNextPath } from '@/lib/portalRoutes';

export default async function AdminLoginPage({ searchParams }) {
	const params = await searchParams;
	const requestedNext = params?.next || '';
	const nextPath = normalizeLoginNextPath(
		typeof requestedNext === 'string' && requestedNext.startsWith('/admin')
			? requestedNext
			: '/admin',
	);

	return (
		<main className="relative min-h-screen overflow-x-hidden bg-[#02070d] px-3 py-8 text-white sm:px-6 lg:px-8">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_12%,rgba(255,47,47,0.28),transparent_34%),radial-gradient(circle_at_8%_88%,rgba(20,68,97,0.22),transparent_32%),linear-gradient(145deg,#01050a_0%,#06101a_46%,#08070d_100%)]" />
			<div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full min-w-0 max-w-5xl flex-col">
				<div className="flex items-center justify-between gap-4">
					<Link href="/" className="text-sm font-bold uppercase text-white">
						Signatura
					</Link>
					<Link
						href={`/admin/register?next=${encodeURIComponent(nextPath)}`}
						className="text-sm font-semibold text-red-200">
						Create admin account
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
							Admin Portal
						</h1>
						<p className="mt-2 text-sm font-bold uppercase text-red-400 sm:text-base">
							Signatura system administration
						</p>
					</div>

					<LoginPasskeyForm nextPath={nextPath} />
				</section>
			</div>
		</main>
	);
}
