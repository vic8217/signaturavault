import Image from 'next/image';
import Link from 'next/link';

const navItems = [
	['Security', '/security'],
	['Issuers', '/issuers'],
	['Owners', '/document-owners'],
	['Pricing', '/pricing'],
	['Contact', '/contact'],
];

const portalRoles = [
	['DOCUMENT_OWNER', 'Document Owner', 'Open wallet'],
	['ISSUER_ADMIN', 'Issuer Admin', 'Open issuer portal'],
	['ISSUER_STAFF', 'Issuer Staff', 'Open issuer portal'],
	['SIGNATURA_ADMIN', 'Signatura Admin', 'Open admin console'],
];

function PublicMarketingLayout({ children }) {
	return (
		<div className="min-h-screen bg-slate-950 text-white">
			<header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
				<div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
					<Link href="/" className="flex items-center gap-3">
						<Image
							src="/signatura-logo.png"
							alt="Signatura logo"
							width={44}
							height={52}
							className="h-11 w-11 object-contain"
							priority
						/>
						<span className="hidden text-lg font-bold uppercase tracking-[0.18em] sm:block">
							Signatura
						</span>
					</Link>

					<nav className="hidden items-center gap-7 text-sm font-medium text-slate-200 lg:flex">
						{navItems.map(([label, href]) => (
							<Link
								key={href}
								href={href}
								className="border-b border-transparent pb-1 transition hover:border-red-500 hover:text-red-300">
								{label}
							</Link>
						))}
					</nav>

					<Link
						href="/contact"
						className="rounded-xl bg-red-500 px-4 py-3 text-sm font-bold text-white shadow-[0_0_30px_rgba(239,68,68,0.3)] transition hover:bg-red-400">
						Request Demo
					</Link>
				</div>
			</header>
			<main>{children}</main>
			<footer className="border-t border-white/10 bg-black/20 px-5 py-10 text-center text-sm text-slate-400">
				<p>© 2026 Signatura. Secure digital documents, verified at the source.</p>
			</footer>
		</div>
	);
}

function PageHero({ eyebrow, title, text, children }) {
	return (
		<section className="relative isolate overflow-hidden px-4 py-20 sm:px-6 lg:px-8">
			<div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_75%_20%,rgba(255,45,45,0.18),transparent_28%),radial-gradient(circle_at_20%_8%,rgba(38,92,150,0.24),transparent_32%),linear-gradient(180deg,#030914_0%,#071224_58%,#030914_100%)]" />
			<div className="mx-auto max-w-7xl">
				<p className="text-sm font-bold uppercase tracking-[0.28em] text-red-300">
					{eyebrow}
				</p>
				<h1 className="mt-5 max-w-4xl text-4xl font-black leading-[1.02] tracking-tight sm:text-5xl md:text-6xl">
					{title}
				</h1>
				<p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">{text}</p>
				{children}
			</div>
		</section>
	);
}

function FeatureGrid({ items }) {
	return (
		<section className="px-4 pb-16 sm:px-6 lg:px-8">
			<div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
				{items.map((item) => (
					<article
						key={item.title}
						className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
						<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
							{item.kicker}
						</p>
						<h2 className="mt-4 text-xl font-black">{item.title}</h2>
						<p className="mt-3 text-sm leading-6 text-slate-300">{item.text}</p>
					</article>
				))}
			</div>
		</section>
	);
}

function RoleAccessPanel() {
	return (
		<section className="px-4 pb-20 sm:px-6 lg:px-8">
			<div className="mx-auto max-w-7xl rounded-2xl border border-white/10 bg-white/[0.04] p-6">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
							Portal access
						</p>
						<h2 className="mt-2 text-2xl font-black">Role-based sign in</h2>
					</div>
					<p className="max-w-xl text-sm leading-6 text-slate-300">
						These buttons set the demo session role cookie used by the RBAC
						proxy. Production auth can replace this endpoint without changing the
						portal gates.
					</p>
				</div>
				<div className="mt-6 grid gap-3 md:grid-cols-4">
					{portalRoles.map(([role, label, action]) => (
						<form key={role} action="/api/auth/session" method="post">
							<input type="hidden" name="role" value={role} />
							<button className="h-full w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-4 text-left transition hover:border-red-400">
								<span className="block text-sm font-bold text-white">{label}</span>
								<span className="mt-1 block text-xs text-slate-400">{action}</span>
							</button>
						</form>
					))}
				</div>
			</div>
		</section>
	);
}

function MarketingHome() {
	return (
		<>
			<PageHero
				eyebrow="Zero-trust document verification"
				title="Secure digital documents, verified at the source."
				text="Signatura helps issuers protect, issue, and verify official documents using QR verification, encrypted wallets, revocation controls, and private blockchain anchoring.">
				<div className="mt-9 flex flex-col gap-4 sm:flex-row">
					<Link
						href="/contact"
						className="rounded-xl bg-red-500 px-7 py-4 text-center text-sm font-bold text-white transition hover:bg-red-400">
						Request Demo
					</Link>
					<Link
						href="/security"
						className="rounded-xl border border-white/30 px-7 py-4 text-center text-sm font-bold text-white transition hover:border-red-400 hover:text-red-300">
						View Security
					</Link>
				</div>
			</PageHero>
			<FeatureGrid
				items={[
					{
						kicker: 'Issuers',
						title: 'Control official records after release',
						text: 'Issue documents, revoke records, publish QR proof, and connect existing source systems through tenant APIs.',
					},
					{
						kicker: 'Owners',
						title: 'Carry a trusted mobile wallet',
						text: 'Document owners can store credentials, share QR-verifiable proof, and see the current issuer status.',
					},
					{
						kicker: 'Admins',
						title: 'Operate the platform safely',
						text: 'Signatura admins manage issuer tenants, health, analytics, and system-level controls separately.',
					},
				]}
			/>
			<RoleAccessPanel />
		</>
	);
}

function SecurityPage() {
	return (
		<>
			<PageHero
				eyebrow="Security"
				title="Zero-trust controls for documents that must stay authoritative."
				text="Signatura keeps documents encrypted, separates tenant data, anchors hashes privately, and verifies each scan against issuer-controlled status."
			/>
			<FeatureGrid
				items={[
					{
						kicker: 'Encryption',
						title: 'Sensitive data stays protected',
						text: 'Records can be encrypted at rest and shared only through controlled owner or verifier workflows.',
					},
					{
						kicker: 'QR proof',
						title: 'Verification checks live status',
						text: 'Each QR scan can confirm authenticity, expiry, revocation, and issuer identity at the source.',
					},
					{
						kicker: 'Anchoring',
						title: 'Hashes are tamper-evident',
						text: 'Private blockchain anchoring proves integrity without publishing the underlying document content.',
					},
				]}
			/>
		</>
	);
}

function IssuersPage() {
	return (
		<>
			<PageHero
				eyebrow="For issuers"
				title="Issue official records without replacing your source system."
				text="Universities, agencies, employers, and professional bodies can add Signatura as a secure verification layer beside their existing workflows."
			/>
			<FeatureGrid
				items={[
					{
						kicker: 'Tenant portal',
						title: 'Operate issuance workflows',
						text: 'Manage templates, manual issuance, bulk uploads, API clients, revocations, and audit trails.',
					},
					{
						kicker: 'APIs',
						title: 'Connect existing systems',
						text: 'Use tenant-scoped endpoints and webhooks to issue, hash, revoke, and verify records programmatically.',
					},
					{
						kicker: 'Reputation',
						title: 'Reduce fake document risk',
						text: 'Verifiers can confirm documents against the issuer rather than trusting screenshots or editable PDFs.',
					},
				]}
			/>
		</>
	);
}

function DocumentOwnersPage() {
	return (
		<>
			<PageHero
				eyebrow="Document owners"
				title="A mobile-first wallet for official documents."
				text="Owners receive issued credentials in a secure wallet, keep visibility into status, and share proof without exposing more than necessary."
			/>
			<FeatureGrid
				items={[
					{
						kicker: 'Wallet',
						title: 'Credentials in one place',
						text: 'Store diplomas, certificates, employment records, permits, and other issued documents.',
					},
					{
						kicker: 'Sharing',
						title: 'Show QR-verifiable proof',
						text: 'Share documents with employers, schools, banks, and reviewers using controlled verification links.',
					},
					{
						kicker: 'Status',
						title: 'Know what is valid',
						text: 'See whether a credential is active, expired, revoked, or awaiting issuer update.',
					},
				]}
			/>
		</>
	);
}

function PricingPage() {
	return (
		<>
			<PageHero
				eyebrow="Pricing"
				title="Plans sized around issuer volume and verification needs."
				text="Start with a tenant portal, add API throughput, wallet distribution, bulk issuance, and platform support as your program grows."
			/>
			<section className="px-4 pb-20 sm:px-6 lg:px-8">
				<div className="mx-auto grid max-w-7xl gap-4 md:grid-cols-3">
					{[
						['Pilot', 'For controlled launches and proof of value.'],
						['Institution', 'For production issuers with portal and API workflows.'],
						['Enterprise', 'For high-volume programs with support and custom controls.'],
					].map(([title, text]) => (
						<article
							key={title}
							className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
							<h2 className="text-2xl font-black">{title}</h2>
							<p className="mt-3 text-sm leading-6 text-slate-300">{text}</p>
							<Link
								href="/contact"
								className="mt-6 inline-flex rounded-xl bg-red-500 px-5 py-3 text-sm font-bold transition hover:bg-red-400">
								Talk to sales
							</Link>
						</article>
					))}
				</div>
			</section>
		</>
	);
}

function ContactPage() {
	return (
		<>
			<PageHero
				eyebrow="Contact"
				title="Request a Signatura demo."
				text="Tell us about your issuer program, document types, and verification needs. We will help map the right portal, wallet, and API setup."
			/>
			<section className="px-4 pb-20 sm:px-6 lg:px-8">
				<form className="mx-auto grid max-w-3xl gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
					<input
						className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
						placeholder="Work email"
						type="email"
					/>
					<input
						className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
						placeholder="Organization"
					/>
					<textarea
						className="min-h-36 rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
						placeholder="What documents do you need to issue or verify?"
					/>
					<button className="rounded-xl bg-red-500 px-6 py-4 text-sm font-bold text-white transition hover:bg-red-400">
						Send Request
					</button>
				</form>
			</section>
		</>
	);
}

export {
	ContactPage,
	DocumentOwnersPage,
	IssuersPage,
	MarketingHome,
	PricingPage,
	PublicMarketingLayout,
	SecurityPage,
};
