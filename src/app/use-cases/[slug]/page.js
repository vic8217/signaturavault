import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUseCase, useCases } from '@/lib/use-cases';

function Icon({ name, className = 'h-6 w-6' }) {
	const common = {
		className,
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		strokeWidth: 1.8,
		strokeLinecap: 'round',
		strokeLinejoin: 'round',
		'aria-hidden': 'true',
	};

	const icons = {
		arrow: (
			<svg {...common}>
				<path d="M5 12h14" />
				<path d="m13 6 6 6-6 6" />
			</svg>
		),
		bank: (
			<svg {...common}>
				<path d="M4 10h16" />
				<path d="m12 3 8 5H4l8-5Z" />
				<path d="M6 10v8" />
				<path d="M10 10v8" />
				<path d="M14 10v8" />
				<path d="M18 10v8" />
				<path d="M4 21h16" />
			</svg>
		),
		person: (
			<svg {...common}>
				<circle cx="12" cy="8" r="3" />
				<path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
			</svg>
		),
		shield: (
			<svg {...common}>
				<path d="M12 3 19 6v5.2c0 4.2-2.8 7.6-7 9.8-4.2-2.2-7-5.6-7-9.8V6l7-3Z" />
				<path d="m9.2 12.2 1.8 1.8 4-4.2" />
			</svg>
		),
		document: (
			<svg {...common}>
				<path d="M7 3h7l4 4v14H7V3Z" />
				<path d="M14 3v5h4" />
				<path d="M10 12h5" />
				<path d="M10 16h5" />
			</svg>
		),
		qr: (
			<svg {...common}>
				<rect width="5" height="5" x="4" y="4" rx="1" />
				<rect width="5" height="5" x="15" y="4" rx="1" />
				<rect width="5" height="5" x="4" y="15" rx="1" />
				<path d="M15 15h2v2h-2z" />
				<path d="M20 15v5h-5" />
				<path d="M11 4v4" />
				<path d="M4 11h4" />
			</svg>
		),
		lock: (
			<svg {...common}>
				<rect width="14" height="10" x="5" y="11" rx="2" />
				<path d="M8 11V8a4 4 0 0 1 8 0v3" />
			</svg>
		),
		blocks: (
			<svg {...common}>
				<path d="m12 3 4 2.2v4.6L12 12 8 9.8V5.2L12 3Z" />
				<path d="m7 13 4 2.2v4.6L7 22l-4-2.2v-4.6L7 13Z" />
				<path d="m17 13 4 2.2v4.6L17 22l-4-2.2v-4.6L17 13Z" />
			</svg>
		),
		check: (
			<svg {...common}>
				<path d="m5 12 4 4L19 6" />
			</svg>
		),
	};

	return icons[name] ?? icons.shield;
}

function Pill({ children }) {
	return (
		<span className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-red-300">
			{children}
		</span>
	);
}

function ListCard({ title, items, icon }) {
	return (
		<article className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
			<div className="mb-5 flex items-center gap-3">
				<span className="grid h-11 w-11 place-items-center rounded-full border border-red-500/50 bg-red-500/10 text-red-300">
					<Icon name={icon} className="h-6 w-6" />
				</span>
				<h2 className="text-lg font-black">{title}</h2>
			</div>
			<ul className="space-y-3">
				{items.map((item) => (
					<li key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-300">
						<span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-red-500 text-red-400">
							<Icon name="check" className="h-3 w-3" />
						</span>
						<span>{item}</span>
					</li>
				))}
			</ul>
		</article>
	);
}

export function generateStaticParams() {
	return useCases.map((useCase) => ({ slug: useCase.slug }));
}

export async function generateMetadata({ params }) {
	const { slug } = await params;
	const useCase = getUseCase(slug);

	if (!useCase) {
		return {
			title: 'Use Case Not Found - Signatura',
		};
	}

	return {
		title: `${useCase.title} Use Case - Signatura`,
		description: useCase.summary,
	};
}

export default async function UseCaseDetailPage({ params }) {
	const { slug } = await params;
	const useCase = getUseCase(slug);

	if (!useCase) {
		notFound();
	}

	const flow = [
		['bank', useCase.issuer, 'Issues the trusted source record'],
		['lock', 'Signatura', 'Encrypts, anchors, and prepares QR proof'],
		['person', useCase.owner, 'Receives a portable verified document'],
		['qr', useCase.verifier, 'Scans QR to confirm source validity'],
	];

	return (
		<main className="min-h-screen overflow-hidden bg-[#030914] text-white">
			<section className="relative px-4 py-6 sm:px-6 lg:px-10 2xl:px-14">
				<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_8%,rgba(239,68,68,0.2),transparent_28%),radial-gradient(circle_at_15%_18%,rgba(38,92,150,0.2),transparent_30%),linear-gradient(180deg,#030914_0%,#071224_58%,#030914_100%)]" />
				<nav className="relative flex items-center justify-between gap-5">
					<Link href="/" className="flex items-center gap-3">
						<Image
							src="/signatura-logo.png"
							alt="Signatura logo"
							width={48}
							height={56}
							className="h-11 w-11 object-contain"
						/>
						<span className="text-lg font-bold uppercase tracking-[0.18em]">
							Signatura
						</span>
					</Link>
					<div className="flex items-center gap-3">
						<Link
							href="/use-cases"
							className="rounded-xl border border-white/15 px-4 py-2 text-sm font-bold text-slate-200 transition hover:border-red-500 hover:text-red-300">
							Use Cases
						</Link>
						<Link
							href="/issuer-portal/onboarding"
							className="hidden rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-400 sm:inline-block">
							Request Demo
						</Link>
					</div>
				</nav>

				<div className="relative grid gap-10 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
					<div>
						<Pill>{useCase.sector}</Pill>
						<h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight tracking-tight md:text-6xl">
							{useCase.title}
						</h1>
						<p className="mt-5 max-w-3xl text-2xl font-bold leading-9 text-red-400">
							{useCase.headline}
						</p>
						<p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
							{useCase.summary}
						</p>
					</div>

					<div className="relative min-h-[430px]">
						<div className="absolute inset-x-10 top-12 h-64 rounded-full bg-red-500/10 blur-3xl" />
						<div className="relative mx-auto grid max-w-3xl gap-4 rounded-4xl border border-white/10 bg-white/[0.04] p-5 shadow-[0_0_80px_rgba(15,23,42,0.7)] sm:grid-cols-2">
							<div className="rounded-2xl border border-white/10 bg-[#071224] p-5">
								<div className="flex items-center justify-between">
									<span className="text-sm font-bold text-slate-300">Source</span>
									<Icon name="bank" className="h-7 w-7 text-red-400" />
								</div>
								<p className="mt-8 text-2xl font-black">{useCase.issuer}</p>
								<p className="mt-2 text-sm leading-6 text-slate-400">
									Controls the official record and status.
								</p>
							</div>
							<div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
								<div className="flex items-center justify-between">
									<span className="text-sm font-bold text-red-200">Verification Layer</span>
									<Icon name="shield" className="h-7 w-7 text-red-200" />
								</div>
								<div className="mt-8 flex items-center gap-3">
									<Image
										src="/signatura-logo.png"
										alt=""
										width={56}
										height={66}
										className="h-12 w-12 object-contain"
									/>
									<p className="text-2xl font-black">Signatura</p>
								</div>
								<p className="mt-2 text-sm leading-6 text-red-100/80">
									Adds QR proof, encryption, audit trail, and private anchoring.
								</p>
							</div>
							<div className="rounded-2xl border border-white/10 bg-[#071224] p-5">
								<div className="flex items-center justify-between">
									<span className="text-sm font-bold text-slate-300">Owner</span>
									<Icon name="person" className="h-7 w-7 text-red-400" />
								</div>
								<p className="mt-8 text-2xl font-black">{useCase.owner}</p>
								<p className="mt-2 text-sm leading-6 text-slate-400">
									Carries a secure digital document.
								</p>
							</div>
							<div className="rounded-2xl border border-white/10 bg-[#071224] p-5">
								<div className="flex items-center justify-between">
									<span className="text-sm font-bold text-slate-300">Verifier</span>
									<Icon name="qr" className="h-7 w-7 text-red-400" />
								</div>
								<p className="mt-8 text-2xl font-black">{useCase.verifier}</p>
								<p className="mt-2 text-sm leading-6 text-slate-400">
									Scans once to confirm authenticity.
								</p>
							</div>
						</div>
					</div>
				</div>
			</section>

			<section className="grid gap-4 px-4 pb-8 sm:px-6 lg:grid-cols-4 lg:px-10 2xl:px-14">
				{flow.map(([icon, title, text], index) => (
					<article
						key={title}
						className="relative rounded-2xl border border-white/10 bg-white/[0.035] p-6">
						<div className="flex items-start justify-between gap-4">
							<span className="grid h-14 w-14 place-items-center rounded-full border border-red-500 bg-red-500/10 text-red-300">
								<Icon name={icon} className="h-8 w-8" />
							</span>
							<span className="text-5xl font-black text-white/10">
								{String(index + 1).padStart(2, '0')}
							</span>
						</div>
						<h2 className="mt-7 text-xl font-black">{title}</h2>
						<p className="mt-3 text-sm leading-6 text-slate-300">{text}</p>
					</article>
				))}
			</section>

			<section className="grid gap-4 px-4 py-8 sm:px-6 lg:grid-cols-3 lg:px-10 2xl:px-14">
				<ListCard title="Documents Protected" icon="document" items={useCase.documents} />
				<ListCard title="Problems Solved" icon="shield" items={useCase.pain} />
				<ListCard title="What Improves" icon="blocks" items={useCase.benefits} />
			</section>

			<section className="px-4 py-10 sm:px-6 lg:px-10 2xl:px-14">
				<div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
					<div className="grid gap-px bg-white/10 lg:grid-cols-4">
						{useCase.workflow.map((step, index) => (
							<div key={step} className="bg-[#071224] p-6">
								<div className="flex items-center justify-between">
									<span className="grid h-10 w-10 place-items-center rounded-full bg-red-500 text-sm font-black">
										{index + 1}
									</span>
									{index < useCase.workflow.length - 1 ? (
										<Icon name="arrow" className="h-6 w-6 text-red-400" />
									) : (
										<Icon name="check" className="h-6 w-6 text-red-400" />
									)}
								</div>
								<p className="mt-8 text-lg font-black">{step}</p>
							</div>
						))}
					</div>
					<div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between lg:p-8">
						<div>
							<h2 className="text-2xl font-black">
								Ready for {useCase.title.toLowerCase()}?
							</h2>
							<p className="mt-2 text-slate-300">
								Use Signatura as the verification layer while your institution
								remains the source of truth.
							</p>
						</div>
						<Link
							href="/issuer-portal/onboarding"
							className="inline-flex items-center justify-center gap-3 rounded-xl bg-red-500 px-6 py-4 text-sm font-bold text-white transition hover:bg-red-400">
							Request Demo
							<Icon name="arrow" className="h-4 w-4" />
						</Link>
					</div>
				</div>
			</section>
		</main>
	);
}
