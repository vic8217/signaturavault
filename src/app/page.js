import Image from 'next/image';
import Link from 'next/link';
import { LoginModal } from '@/components/LoginModal';
import { useCases } from '@/lib/use-cases';

const navItems = [
	['Home', '#home'],
	['For Issuers', '#issuers'],
	['For Users', '#users'],
	['Security', '#security'],
	['How It Works', '#how-it-works'],
	['Use Cases', '#use-cases'],
	['Contact', '#contact'],
];

const trustBadges = [
	['shield', 'Zero Trust'],
	['blocks', 'Blockchain'],
	['lock', 'Encrypted'],
	['qr', 'QR Verified'],
];

const securityItems = [
	{
		icon: 'identity',
		title: 'Zero-Trust Design',
		text: 'Signatura does not need to read or own document data. Issuers control source records while Signatura secures verification.',
	},
	{
		icon: 'lock',
		title: 'Encryption',
		text: 'Documents and records are encrypted so only authorized parties can view sensitive content.',
	},
	{
		icon: 'blocks',
		title: 'Private Blockchain Anchoring',
		text: 'Tamper-evident document hashes are anchored privately. The actual document stays off-chain.',
	},
	{
		icon: 'qr',
		title: 'QR Verification',
		text: 'Every document can carry a QR code that confirms authenticity, validity, revocation, and expiry.',
	},
];

const issuerBenefits = [
	'Reduce fake document risk',
	'Faster verification',
	'Protect issuer reputation',
	'Control document issuance',
	'Revoke or update status',
	'Connect existing systems via API',
];

const userBenefits = [
	'View official documents',
	'Share securely',
	'Avoid carrying physical copies',
	'Prove authenticity instantly',
	'Keep verified records in one app',
	'Present QR-verifiable documents anywhere',
];

const workSteps = [
	['document', 'Issuer creates or uploads document record'],
	['lock', 'Document is encrypted or linked securely'],
	['hash', 'A hash is generated'],
	['blocks', 'Hash is anchored to private blockchain'],
	['qr', 'QR code is attached to the document'],
	['identity', 'Owner views it in Signatura'],
	['shield', 'Verifier scans QR to confirm authenticity'],
];

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
		play: (
			<svg {...common} fill="currentColor" stroke="none">
				<path d="M8 5.4v13.2L18.6 12 8 5.4Z" />
			</svg>
		),
		check: (
			<svg {...common}>
				<path d="m5 12 4 4L19 6" />
			</svg>
		),
		x: (
			<svg {...common}>
				<path d="m7 7 10 10" />
				<path d="m17 7-10 10" />
			</svg>
		),
		shield: (
			<svg {...common}>
				<path d="M12 3 19 6v5.2c0 4.2-2.8 7.6-7 9.8-4.2-2.2-7-5.6-7-9.8V6l7-3Z" />
				<path d="m9.2 12.2 1.8 1.8 4-4.2" />
			</svg>
		),
		lock: (
			<svg {...common}>
				<rect width="14" height="10" x="5" y="11" rx="2" />
				<path d="M8 11V8a4 4 0 0 1 8 0v3" />
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
				<path d="M11 15h1" />
				<path d="M11 20h1" />
			</svg>
		),
		blocks: (
			<svg {...common}>
				<path d="m12 3 4 2.2v4.6L12 12 8 9.8V5.2L12 3Z" />
				<path
					d="m5 12 4 2.2v4.6L5 21l-4-2.2v-4.6L5 12Z"
					transform="translate(3 -1)"
				/>
				<path d="m15 12 4 2.2v4.6L15 21l-4-2.2v-4.6L15 12Z" />
				<path d="M12 12v3" />
				<path d="M8 15.2 6.5 14" />
				<path d="m16 15.2 1.5-1.2" />
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
		identity: (
			<svg {...common}>
				<circle cx="12" cy="8" r="3" />
				<path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
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
		hash: (
			<svg {...common}>
				<path d="M10 3 8 21" />
				<path d="m16 3-2 18" />
				<path d="M4 8h17" />
				<path d="M3 16h17" />
			</svg>
		),
	};

	return icons[name] ?? icons.shield;
}

function CheckItem({ children }) {
	return (
		<li className="flex items-start gap-3 text-sm leading-6 text-slate-200">
			<span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-red-500 text-red-400">
				<Icon name="check" className="h-3 w-3" />
			</span>
			<span>{children}</span>
		</li>
	);
}

function ProblemItem({ children }) {
	return (
		<li className="flex items-start gap-3 text-sm leading-6 text-slate-200">
			<span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-red-500 text-red-400">
				<Icon name="x" className="h-3 w-3" />
			</span>
			<span>{children}</span>
		</li>
	);
}

export default function Home() {
	return (
		<main
			id="home"
			className="relative isolate min-h-screen overflow-hidden bg-slate-950 text-white">
			<div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_75%_20%,rgba(255,45,45,0.18),transparent_28%),radial-gradient(circle_at_20%_8%,rgba(38,92,150,0.24),transparent_32%),linear-gradient(180deg,#030914_0%,#071224_48%,#030914_100%)]" />

			<nav className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
				<div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-10 2xl:px-0">
					<Link href="#home" className="flex items-center gap-3">
						<Image
							src="/signatura-logo.png"
							alt="Signatura logo"
							width={48}
							height={56}
							priority
							className="h-11 w-auto object-contain"
						/>
						<span className="hidden text-lg font-bold uppercase tracking-[0.18em] sm:block">
							Signatura
						</span>
					</Link>

					<div className="hidden items-center gap-8 text-sm font-medium text-slate-200 lg:flex">
						{navItems.map(([label, href]) => (
							<Link
								key={label}
								href={href}
								className="border-b border-transparent pb-1 transition hover:border-red-500 hover:text-red-400">
								{label}
							</Link>
						))}
					</div>

					<div className="flex items-center gap-2 sm:gap-3">
						<Link
							href="/login?next=/wallet"
							className="rounded-xl border border-white/20 px-4 py-3 text-sm font-bold text-white transition hover:border-red-400 hover:text-red-300 sm:hidden">
							Login
						</Link>
						<div className="hidden sm:block">
							<LoginModal />
						</div>
						<Link
							href="/issuer-portal/onboarding"
							className="hidden rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white shadow-[0_0_30px_rgba(239,68,68,0.35)] transition hover:bg-red-400 sm:inline-block sm:px-5">
							Request Demo
						</Link>
					</div>
				</div>
			</nav>

			<section className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:min-h-[calc(100vh-81px)] lg:grid-cols-[0.92fr_1.08fr] lg:px-10 lg:py-12 2xl:px-0">
				<div>
					<div className="mb-6 h-1 w-16 rounded-full bg-red-500" />
					<h1 className="max-w-2xl text-4xl font-black leading-[1.02] tracking-tight sm:text-5xl md:text-6xl">
						Secure Digital Documents.
						<span className="block text-red-500">Verified at the Source.</span>
					</h1>
					<p className="mt-7 max-w-xl text-lg leading-8 text-slate-300">
						Signatura helps issuers protect, issue, and verify official
						documents using zero-trust security, QR verification, and private
						blockchain anchoring.
					</p>
					<div className="mt-9 flex flex-col gap-4 sm:flex-row">
						<Link
							href="/issuer-portal/onboarding"
							className="rounded-xl bg-red-500 px-7 py-4 text-center text-sm font-bold text-white shadow-[0_0_36px_rgba(239,68,68,0.34)] transition hover:bg-red-400">
							Request Demo
						</Link>
						<Link
							href="#how-it-works"
							className="inline-flex items-center justify-center gap-3 rounded-xl border border-white/30 px-7 py-4 text-sm font-bold text-white transition hover:border-red-400 hover:text-red-300">
							<Icon name="play" className="h-4 w-4" />
							How It Works
						</Link>
					</div>
					<div className="mt-12 grid grid-cols-2 gap-5 text-sm text-slate-200 sm:grid-cols-4">
						{trustBadges.map(([icon, label]) => (
							<div key={label} className="flex items-center gap-3">
								<Icon name={icon} className="h-6 w-6 text-red-400" />
								<span>{label}</span>
							</div>
						))}
					</div>
				</div>

				<div className="relative min-h-105 lg:min-h-130">
					<div className="absolute left-1/2 top-6 h-64 w-64 -translate-x-1/2 rounded-full border border-red-500/20 bg-slate-950/70 shadow-[0_0_90px_rgba(248,35,35,0.2)] sm:h-80 sm:w-80" />
					<div className="absolute left-[6%] top-24 hidden h-52 w-44 rotate-[-8deg] rounded-4xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl md:block">
						<div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-red-500/70 bg-red-500/10 text-red-400">
							<Icon name="shield" className="h-9 w-9" />
						</div>
						<div className="space-y-3">
							<div className="h-2 rounded-full bg-slate-600" />
							<div className="h-2 w-2/3 rounded-full bg-slate-700" />
							<div className="h-2 w-4/5 rounded-full bg-red-500/70" />
						</div>
					</div>
					<div className="relative mx-auto grid h-105 w-full max-w-160 place-items-center lg:h-130">
						<div className="absolute inset-x-20 bottom-10 h-12 rounded-full bg-red-500/25 blur-2xl" />
						<div className="relative grid h-64 w-64 place-items-center rounded-full border border-white/10 bg-[radial-gradient(circle,#152033_0%,#070d19_62%,transparent_63%)] shadow-[inset_0_0_80px_rgba(255,255,255,0.04)] sm:h-80 sm:w-80">
							<Image
								src="/signatura-logo.png"
								alt="Signatura identity mark"
								width={290}
								height={340}
								priority
								className="h-52 w-auto object-contain drop-shadow-[0_0_34px_rgba(248,35,35,0.45)] sm:h-64"
							/>
						</div>
					</div>
					<div className="absolute right-0 top-16 hidden w-60 rounded-[1.75rem] border border-red-500/60 bg-red-500/5 p-6 shadow-[0_0_55px_rgba(248,35,35,0.2)] sm:block">
						<div className="ml-auto h-12 w-12 rounded-tr-xl border-r-2 border-t-2 border-red-400" />
						<div className="space-y-3">
							<div className="h-2 w-16 rounded-full bg-red-400" />
							<div className="h-2 rounded-full bg-red-300/70" />
							<div className="h-2 w-4/5 rounded-full bg-red-300/60" />
							<div className="h-2 w-3/5 rounded-full bg-red-300/50" />
						</div>
						<div className="mt-8 flex items-end justify-between">
							<div className="h-7 w-20 rounded-full border-b border-red-300" />
							<div className="grid h-16 w-16 place-items-center rounded-full border-2 border-red-400 text-red-300">
								<Icon name="check" className="h-8 w-8" />
							</div>
						</div>
					</div>
				</div>
			</section>

			<section className="w-full px-4 sm:px-6 lg:px-10 2xl:px-14">
				<div className="grid w-full overflow-hidden rounded-2xl border border-white/10 bg-white/3.5 shadow-[0_0_80px_rgba(15,23,42,0.55)] lg:grid-cols-[1fr_1fr_0.9fr]">
					<div className="p-8 lg:p-10">
						<h2 className="text-xl font-black text-red-500">The Problem</h2>
						<p className="mt-3 max-w-sm text-lg font-bold leading-7">
							Fake documents are easy to create. Verification is hard.
						</p>
						<ul className="mt-6 space-y-3">
							<ProblemItem>Fake diplomas and certificates</ProblemItem>
							<ProblemItem>Manual verification takes days</ProblemItem>
							<ProblemItem>Screenshots and PDFs can be edited</ProblemItem>
							<ProblemItem>Issuers lose control after release</ProblemItem>
							<ProblemItem>Users need a trusted digital copy</ProblemItem>
						</ul>
					</div>

					<div className="border-y border-white/10 p-8 lg:border-x lg:border-y-0 lg:p-10">
						<h2 className="text-xl font-black text-red-500">
							The Signatura Solution
						</h2>
						<p className="mt-3 max-w-sm text-lg font-bold leading-7">
							A secure verification layer between issuers, document owners, and
							verifiers.
						</p>
						<ul className="mt-6 space-y-3">
							<CheckItem>Issue digital documents</CheckItem>
							<CheckItem>Add QR verification</CheckItem>
							<CheckItem>Anchor hashes to private blockchain</CheckItem>
							<CheckItem>Provide encrypted access to owners</CheckItem>
							<CheckItem>Allow third parties to verify authenticity</CheckItem>
							<CheckItem>Keep issuer data under issuer control</CheckItem>
						</ul>
					</div>

					<div className="relative min-h-72 p-8">
						<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_60%,rgba(239,68,68,0.18),transparent_42%)]" />
						<div className="relative mx-auto mt-8 grid h-48 w-48 place-items-center rounded-4xl border border-red-500/30 bg-slate-950 shadow-[0_22px_80px_rgba(248,35,35,0.16)]">
							<div className="absolute -left-8 -top-6 h-12 w-12 rounded-xl border border-white/10 bg-slate-800" />
							<div className="absolute -right-8 top-7 h-12 w-12 rounded-xl border border-white/10 bg-slate-800" />
							<div className="absolute -bottom-5 left-4 h-12 w-12 rounded-xl border border-white/10 bg-slate-800" />
							<div className="rotate-6 rounded-2xl border border-white/15 bg-white p-5 text-slate-900 shadow-2xl">
								<Icon name="document" className="h-28 w-28 text-slate-700" />
							</div>
							<div className="absolute bottom-8 right-8 grid h-16 w-16 place-items-center rounded-2xl bg-slate-900 text-red-400 ring-2 ring-red-500">
								<Icon name="shield" className="h-9 w-9" />
							</div>
						</div>
					</div>
				</div>
			</section>

			<section
				id="security"
				className="w-full px-4 py-16 sm:px-6 lg:px-10 2xl:px-14">
				<h2 className="text-center text-3xl font-black">
					Security Built for <span className="text-red-500">Trust</span>
				</h2>
				<div className="mx-auto mt-3 h-1 w-16 rounded-full bg-red-500" />
				<div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
					{securityItems.map((item) => (
						<article
							key={item.title}
							className="border-white/10 px-6 lg:border-l first:lg:border-l-0">
							<div className="mb-6 grid h-20 w-20 place-items-center rounded-full border border-red-500 bg-red-500/10 text-slate-100 shadow-[0_0_30px_rgba(248,35,35,0.24)]">
								<Icon name={item.icon} className="h-10 w-10" />
							</div>
							<h3 className="text-lg font-bold">{item.title}</h3>
							<p className="mt-3 text-sm leading-6 text-slate-300">
								{item.text}
							</p>
						</article>
					))}
				</div>
			</section>

			<section
				id="issuers"
				className="grid w-full gap-px overflow-hidden border-y border-white/10 bg-white/10 px-px md:grid-cols-2">
				<div className="bg-[#071224] p-8 lg:p-10">
					<h2 className="text-2xl font-black text-red-500">For Issuers</h2>
					<p className="mt-2 text-lg">Protect your reputation. Take control.</p>
					<div className="mt-7 grid gap-7 sm:grid-cols-[86px_1fr]">
						<div className="grid h-20 w-20 place-items-center rounded-full border border-red-500 bg-red-500/10">
							<Icon name="bank" className="h-11 w-11" />
						</div>
						<ul className="grid gap-3 sm:grid-cols-2">
							{issuerBenefits.map((benefit) => (
								<CheckItem key={benefit}>{benefit}</CheckItem>
							))}
						</ul>
					</div>
				</div>

				<div id="users" className="bg-[#071224] p-8 lg:p-10">
					<h2 className="text-2xl font-black text-red-500">For Users</h2>
					<p className="mt-2 text-lg">Your documents. Always trusted.</p>
					<div className="mt-7 grid gap-7 sm:grid-cols-[86px_1fr]">
						<div className="grid h-20 w-20 place-items-center rounded-full border border-red-500 bg-red-500/10">
							<Icon name="identity" className="h-11 w-11" />
						</div>
						<ul className="grid gap-3 sm:grid-cols-2">
							{userBenefits.map((benefit) => (
								<CheckItem key={benefit}>{benefit}</CheckItem>
							))}
						</ul>
					</div>
				</div>
			</section>

			<section
				id="how-it-works"
				className="w-full px-4 py-16 sm:px-6 lg:px-10 2xl:px-14">
				<div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-white/3.5">
					<div className="p-8 lg:p-10">
						<h2 className="text-center text-3xl font-black">
							How <span className="text-red-500">Signatura</span> Works
						</h2>
						<div className="mt-12 grid gap-8 md:grid-cols-4 lg:grid-cols-7">
							{workSteps.map(([icon, text], index) => (
								<div key={text} className="relative text-center">
									<div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-red-500 bg-slate-950 text-slate-100">
										<Icon name={icon} className="h-10 w-10" />
									</div>
									<div className="mx-auto -mt-3 grid h-6 w-6 place-items-center rounded-full bg-red-500 text-xs font-black">
										{index + 1}
									</div>
									<p className="mt-4 text-sm leading-6 text-slate-300">
										{text}
									</p>
								</div>
							))}
						</div>
					</div>
					<div className="border-t border-white/10 px-8 py-6 lg:px-10">
						<div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
							<div className="flex items-center gap-4">
								<Image
									src="/signatura-logo.png"
									alt=""
									width={70}
									height={82}
									className="h-14 w-auto object-contain"
								/>
								<div>
									<h3 className="text-2xl font-black">
										Signatura{' '}
										<span className="text-red-500">Does Not Replace</span> the
										Issuer
									</h3>
									<p className="mt-1 text-slate-300">
										The issuer remains the official source. Signatura is the
										secure digital document and verification layer.
									</p>
								</div>
							</div>
							<div className="flex items-center gap-4 text-red-400">
								<Icon name="bank" className="h-10 w-10" />
								<span className="h-px w-12 bg-red-500/60" />
								<Icon name="shield" className="h-10 w-10" />
								<span className="h-px w-12 bg-red-500/60" />
								<Icon name="identity" className="h-10 w-10" />
							</div>
						</div>
					</div>
				</div>
			</section>

			<section
				id="use-cases"
				className="w-full px-4 pb-16 sm:px-6 lg:px-10 2xl:px-14">
				<h2 className="text-center text-3xl font-black">Use Cases</h2>
				<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{useCases.map((useCase) => (
						<Link
							key={useCase.slug}
							href={`/use-cases/${useCase.slug}`}
							className="rounded-xl border border-white/10 bg-white/3.5 px-5 py-4 text-center text-sm font-semibold text-slate-200 transition hover:border-red-500 hover:text-red-300">
							{useCase.title}
						</Link>
					))}
				</div>
			</section>

			<footer
				id="contact"
				className="border-t border-white/10 bg-black/20 px-5 py-10 text-center text-sm text-slate-400">
				<p>© 2026 Signatura. Secure digital documents, verified at the source.</p>
			</footer>
		</main>
	);
}
