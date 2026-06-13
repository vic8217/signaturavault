import Link from 'next/link';
import { useCases } from '@/lib/use-cases';

const audiences = [
	'Schools',
	'Universities',
	'Clinics',
	'Doctors',
	'HOAs',
	'Associations',
	'Businesses',
];

const issuerBenefits = [
	{
		kicker: 'Efficiency',
		title: 'Efficient digital issuance',
		text: 'Publish official records from templates, bulk uploads, or API workflows without replacing your source system.',
	},
	{
		kicker: 'Requests',
		title: 'Convenient request & release',
		text: 'Handle document requests and release verified digital copies with audit trails instead of manual email chains.',
	},
	{
		kicker: 'Fraud',
		title: 'Lower fake-document risk',
		text: 'Verifiers confirm records against your issuer tenant—not screenshots, forwarded PDFs, or edited attachments.',
	},
	{
		kicker: 'QR proof',
		title: 'QR-based verification',
		text: 'Every issued record can carry QR proof that resolves to live validity, expiry, and revocation status.',
	},
	{
		kicker: 'Source truth',
		title: 'Verify from issuer records',
		text: 'Checks run against your controlled issuance database so status always reflects the issuing organization.',
	},
	{
		kicker: 'Zero Trust',
		title: 'Zero Trust Level 2 protection',
		text: 'Role-based access, trusted-device approval, encrypted private fields, and tenant isolation by design.',
	},
	{
		kicker: 'Privacy',
		title: 'Admins cannot read protected data',
		text: 'Platform operators manage tenants and health without access to encrypted document owner private fields.',
	},
];

const issuanceSteps = [
	{
		step: '01',
		title: 'Define templates',
		text: 'Upload document layouts, map fields, and publish tenant-scoped templates for diplomas, certificates, clearances, and more.',
	},
	{
		step: '02',
		title: 'Issue records',
		text: 'Issue manually, in bulk, or through APIs while hashes and metadata are captured for audit and anchoring.',
	},
	{
		step: '03',
		title: 'Attach QR proof',
		text: 'Each record receives a verification token and QR link verifiers can scan in the field or online.',
	},
	{
		step: '04',
		title: 'Anchor & audit',
		text: 'Commitments are anchored privately, revocations propagate instantly, and every action is logged per tenant.',
	},
];

const verificationSteps = [
	{
		step: '01',
		title: 'Scan or open QR',
		text: 'A verifier scans the QR code on a credential or opens a secure verification link.',
	},
	{
		step: '02',
		title: 'Lookup issuer record',
		text: 'Signatura resolves the token against the issuing tenant’s controlled record—not a copied file.',
	},
	{
		step: '03',
		title: 'Return live status',
		text: 'The response shows valid, expired, revoked, or superseded status with issuer identity.',
	},
	{
		step: '04',
		title: 'Protect private data',
		text: 'Sensitive owner fields stay encrypted; verifiers see only what the issuer and policy allow.',
	},
];

const featuredSlugs = [
	'universities',
	'medical-records',
	'professional-credentials',
	'hr-payroll',
	'government',
	'training-certificates',
];

const featuredUseCases = featuredSlugs
	.map((slug) => useCases.find((item) => item.slug === slug))
	.filter(Boolean);

function SectionHeading({ eyebrow, title, text }) {
	return (
		<div className="mx-auto max-w-3xl text-center">
			<p className="text-sm font-bold uppercase tracking-[0.28em] text-red-300">
				{eyebrow}
			</p>
			<h2 className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">
				{title}
			</h2>
			{text ? (
				<p className="mt-4 text-base leading-7 text-slate-300">{text}</p>
			) : null}
		</div>
	);
}

function DashboardPreview() {
	return (
		<div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#071224] p-5 shadow-[0_0_80px_rgba(239,68,68,0.12)]">
			<div className="flex items-center justify-between border-b border-white/10 pb-4">
				<div>
					<p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">
						Issuer portal
					</p>
					<p className="mt-1 text-lg font-bold text-white">Tenant dashboard</p>
				</div>
				<span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-100">
					Live
				</span>
			</div>
			<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
				{[
					['Issued', '1,284'],
					['Verifications', '342'],
					['Templates', '18'],
					['Pending', '6'],
				].map(([label, value]) => (
					<div
						key={label}
						className="rounded-xl border border-white/10 bg-white/4 px-3 py-3">
						<p className="text-xs text-slate-400">{label}</p>
						<p className="mt-1 text-xl font-bold text-white">{value}</p>
					</div>
				))}
			</div>
			<div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
				<div className="rounded-xl border border-white/10 bg-slate-950/70 p-4">
					<p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
						Recent issuance
					</p>
					<div className="mt-3 space-y-2">
						{['TOR-2026-0412', 'COE-88421', 'MED-CERT-119'].map((id) => (
							<div
								key={id}
								className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-sm">
								<span className="font-mono text-slate-200">{id}</span>
								<span className="text-xs font-bold text-emerald-300">Valid</span>
							</div>
						))}
					</div>
				</div>
				<div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-red-400/30 bg-red-500/5 p-6 text-center">
					<div className="grid h-28 w-28 place-items-center rounded-2xl border border-white/10 bg-slate-950">
						<div className="grid grid-cols-3 gap-1 p-2">
							{Array.from({ length: 9 }).map((_, index) => (
								<span
									key={index}
									className={`h-3 w-3 rounded-sm ${
										index % 2 === 0 ? 'bg-red-400' : 'bg-slate-700'
									}`}
								/>
							))}
						</div>
					</div>
					<p className="mt-4 text-sm font-bold text-white">QR verification</p>
					<p className="mt-1 text-xs text-slate-400">Scan checks issuer record</p>
				</div>
			</div>
		</div>
	);
}

function IssuersMarketingPage() {
	return (
		<>
			<section className="relative isolate overflow-hidden px-4 py-20 sm:px-6 lg:px-8">
				<div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_75%_20%,rgba(255,45,45,0.18),transparent_28%),radial-gradient(circle_at_20%_8%,rgba(38,92,150,0.24),transparent_32%),linear-gradient(180deg,#030914_0%,#071224_58%,#030914_100%)]" />
				<div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
					<div>
						<p className="text-sm font-bold uppercase tracking-[0.28em] text-red-300">
							For issuers
						</p>
						<h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.02] tracking-tight sm:text-5xl md:text-6xl">
							Issue trusted digital documents at the source.
						</h1>
						<p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
							Signatura helps schools, universities, clinics, HOAs, associations,
							and businesses issue official records with QR verification, revocation
							controls, and Zero Trust Level 2 protection—without replacing your
							existing systems.
						</p>
						<div className="mt-6 flex flex-wrap gap-2">
							{audiences.map((label) => (
								<span
									key={label}
									className="rounded-full border border-white/10 bg-white/4 px-3 py-1 text-xs font-semibold text-slate-200">
									{label}
								</span>
							))}
						</div>
						<div className="mt-9 flex flex-col gap-4 sm:flex-row">
							<Link
								href="/contact"
								className="rounded-xl bg-red-500 px-7 py-4 text-center text-sm font-bold text-white shadow-[0_0_30px_rgba(239,68,68,0.35)] transition hover:bg-red-400">
								Request demo
							</Link>
							<Link
								href="/login?next=/issuer"
								className="rounded-xl border border-white/30 px-7 py-4 text-center text-sm font-bold text-white transition hover:border-red-400 hover:text-red-300">
								Issuer login
							</Link>
						</div>
					</div>
					<DashboardPreview />
				</div>
			</section>

			<section className="px-4 pb-16 sm:px-6 lg:px-8">
				<SectionHeading
					eyebrow="Issuer benefits"
					title="Built for organizations that must stand behind every document"
					text="Reduce manual verification load, protect your reputation, and give recipients portable proof that checks back to your issuer tenant."
				/>
				<div className="mx-auto mt-10 grid max-w-7xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{issuerBenefits.map((item) => (
						<article
							key={item.title}
							className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
							<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
								{item.kicker}
							</p>
							<h3 className="mt-4 text-xl font-black text-white">{item.title}</h3>
							<p className="mt-3 text-sm leading-6 text-slate-300">{item.text}</p>
						</article>
					))}
				</div>
			</section>

			<section className="border-y border-white/10 bg-black/20 px-4 py-16 sm:px-6 lg:px-8">
				<SectionHeading
					eyebrow="How issuance works"
					title="From template to tamper-evident proof"
				/>
				<div className="mx-auto mt-10 grid max-w-7xl gap-4 md:grid-cols-2 xl:grid-cols-4">
					{issuanceSteps.map((item) => (
						<article
							key={item.step}
							className="rounded-2xl border border-white/10 bg-white/4 p-6">
							<p className="text-sm font-black text-red-400">{item.step}</p>
							<h3 className="mt-3 text-lg font-bold text-white">{item.title}</h3>
							<p className="mt-3 text-sm leading-6 text-slate-300">{item.text}</p>
						</article>
					))}
				</div>
			</section>

			<section className="px-4 py-16 sm:px-6 lg:px-8">
				<SectionHeading
					eyebrow="Use cases"
					title="Programs that benefit immediately"
					text="Whether you issue academic records, medical certificates, association credentials, or employment documents, Signatura keeps verification tied to your issuer record."
				/>
				<div className="mx-auto mt-10 grid max-w-7xl gap-4 md:grid-cols-2 xl:grid-cols-3">
					{featuredUseCases.map((item) => (
						<article
							key={item.slug}
							className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
							<p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">
								{item.sector}
							</p>
							<h3 className="mt-3 text-xl font-black text-white">{item.title}</h3>
							<p className="mt-3 text-sm leading-6 text-slate-300">{item.summary}</p>
							<Link
								href={`/use-cases/${item.slug}`}
								className="mt-5 inline-flex text-sm font-bold text-red-300 transition hover:text-red-200">
								View use case →
							</Link>
						</article>
					))}
					<article className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6">
						<p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">
							Communities
						</p>
						<h3 className="mt-3 text-xl font-black text-white">HOAs & associations</h3>
						<p className="mt-3 text-sm leading-6 text-slate-300">
							Issue membership certificates, clearance letters, and official notices
							with QR verification for boards, managers, and residents.
						</p>
					</article>
				</div>
			</section>

			<section className="border-t border-white/10 bg-[#071224] px-4 py-16 sm:px-6 lg:px-8">
				<SectionHeading
					eyebrow="Verification flow"
					title="Verifiers check the issuer—not the attachment"
				/>
				<div className="mx-auto mt-10 grid max-w-7xl gap-4 md:grid-cols-2 xl:grid-cols-4">
					{verificationSteps.map((item) => (
						<article
							key={item.step}
							className="rounded-2xl border border-white/10 bg-slate-950/60 p-6">
							<p className="text-sm font-black text-red-400">{item.step}</p>
							<h3 className="mt-3 text-lg font-bold text-white">{item.title}</h3>
							<p className="mt-3 text-sm leading-6 text-slate-300">{item.text}</p>
						</article>
					))}
				</div>
			</section>

			<section className="px-4 pb-20 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-7xl rounded-3xl border border-red-500/20 bg-[radial-gradient(circle_at_80%_0%,rgba(239,68,68,0.18),transparent_40%),linear-gradient(180deg,#0b1220,#030914)] p-8 sm:p-12">
					<div className="max-w-2xl">
						<p className="text-sm font-bold uppercase tracking-[0.28em] text-red-300">
							Get started
						</p>
						<h2 className="mt-4 text-3xl font-black text-white sm:text-4xl">
							Launch your issuer tenant with Signatura
						</h2>
						<p className="mt-4 text-base leading-7 text-slate-300">
							Talk to our team about templates, API integration, wallet distribution,
							and verification volume. Existing issuers can sign in directly to the
							tenant portal.
						</p>
					</div>
					<div className="mt-8 flex flex-col gap-4 sm:flex-row">
						<Link
							href="/contact"
							className="rounded-xl bg-red-500 px-7 py-4 text-center text-sm font-bold text-white transition hover:bg-red-400">
							Request demo
						</Link>
						<Link
							href="/issuer/onboarding"
							className="rounded-xl border border-white/20 px-7 py-4 text-center text-sm font-bold text-white transition hover:border-red-400">
							Issuer onboarding
						</Link>
						<Link
							href="/login?next=/issuer"
							className="rounded-xl border border-white/20 px-7 py-4 text-center text-sm font-bold text-slate-200 transition hover:border-red-400 hover:text-white">
							Issuer login
						</Link>
					</div>
				</div>
			</section>
		</>
	);
}

export { IssuersMarketingPage };
