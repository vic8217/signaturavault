import Image from 'next/image';
import Link from 'next/link';
import { useCases } from '@/lib/use-cases';

function ArrowIcon() {
	return (
		<svg
			className="h-4 w-4"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true">
			<path d="M5 12h14" />
			<path d="m13 6 6 6-6 6" />
		</svg>
	);
}

export const metadata = {
	title: 'Use Cases - Signatura',
	description:
		'Visual explanations of where Signatura can be used across education, government, HR, healthcare, finance, and professional credentials.',
};

export default function UseCasesPage() {
	return (
		<main className="min-h-screen bg-[#030914] text-white">
			<section className="relative overflow-hidden px-4 py-10 sm:px-6 lg:px-10 2xl:px-14">
				<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(239,68,68,0.18),transparent_28%),linear-gradient(180deg,#030914_0%,#071224_62%,#030914_100%)]" />
				<div className="relative flex items-center justify-between gap-6">
					<Link href="/" className="flex items-center gap-3">
						<Image
							src="/signatura-logo.png"
							alt="Signatura logo"
							width={48}
							height={56}
							className="h-11 w-auto object-contain"
						/>
						<span className="text-lg font-bold uppercase tracking-[0.18em]">
							Signatura
						</span>
					</Link>
					<Link
						href="/"
						className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-slate-200 transition hover:border-red-500 hover:text-red-300">
						Home
					</Link>
				</div>

				<div className="relative mx-auto max-w-4xl py-16 text-center">
					<p className="text-sm font-bold uppercase tracking-[0.28em] text-red-400">
						Use Cases
					</p>
					<h1 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">
						Where Signatura Fits
					</h1>
					<p className="mt-6 text-lg leading-8 text-slate-300">
						Each page shows how an issuer creates a trusted document, how the
						owner carries it, and how a verifier confirms it at the source.
					</p>
				</div>
			</section>

			<section className="grid gap-4 px-4 pb-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-10 2xl:px-14">
				{useCases.map((useCase) => (
					<Link
						key={useCase.slug}
						href={`/use-cases/${useCase.slug}`}
						className="group min-h-72 rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition hover:border-red-500 hover:bg-white/6">
						<div className="flex items-center justify-between gap-4">
							<span className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-red-300">
								{useCase.sector}
							</span>
							<span className="grid h-10 w-10 place-items-center rounded-full border border-white/10 text-red-400 transition group-hover:border-red-500">
								<ArrowIcon />
							</span>
						</div>
						<h2 className="mt-8 text-2xl font-black">{useCase.title}</h2>
						<p className="mt-4 text-sm leading-6 text-slate-300">
							{useCase.headline}
						</p>
						<div className="mt-8 h-1 w-14 rounded-full bg-red-500" />
					</Link>
				))}
			</section>
		</main>
	);
}
