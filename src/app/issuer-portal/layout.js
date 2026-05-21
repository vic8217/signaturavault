import Image from 'next/image';
import Link from 'next/link';
import { PortalIcon } from '@/components/PortalIcon';
import { getActiveIssuerProfile } from '@/lib/issuer-profile';

const navItems = [
	['dashboard', 'Dashboard', '/issuer-portal'],
	['document', 'Issuance', '/issuer-portal/issuance'],
	['identity', 'Digital Documents', '/issuer-portal/digital-documents'],
	['template', 'Templates', '/issuer-portal/templates'],
	['shield', 'Revocation', '/issuer-portal/revocation'],
	['audit', 'Audit', '/issuer-portal/audit'],
	['api', 'API', '/issuer-portal/api'],
	['identity', 'Profile', '/issuer-portal/profile'],
];

function issuerInitials(name) {
	return String(name || 'Issuer')
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join('');
}

function IssuerBrand({ issuer, compact = false }) {
	if (!issuer) return null;

	const initials = issuerInitials(issuer.name);

	return (
		<div
			className={`flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] ${
				compact ? 'px-3 py-2' : 'mt-6 px-4 py-3'
			}`}>
			{issuer.logoUrl ? (
				<img
					src={issuer.logoUrl}
					alt={`${issuer.name} logo`}
					className="h-10 w-10 rounded-lg object-contain"
				/>
			) : (
				<div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-red-500/40 bg-red-500/10 text-sm font-bold text-red-200">
					{initials || 'I'}
				</div>
			)}
			<div className="min-w-0">
				<p className="truncate text-sm font-bold text-white">{issuer.name}</p>
				<p className="truncate text-xs text-slate-400">
					{issuer.type || 'Registered issuer'}
				</p>
			</div>
		</div>
	);
}

export default async function IssuerPortalLayout({ children }) {
	const issuer = await getActiveIssuerProfile();

	return (
		<div className="min-h-screen bg-[#030914] text-slate-100">
			<aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-white/10 bg-slate-950 px-5 py-6 lg:block">
				<Link href="/" className="flex items-center gap-3">
					<Image
						src="/signatura-logo.png"
						alt="Signatura logo"
						width={44}
						height={52}
						className="h-11 w-auto object-contain"
					/>
					<div>
						<p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-400">
							Signatura
						</p>
						<h1 className="text-2xl font-bold text-white">Issuer Portal</h1>
					</div>
				</Link>
				<IssuerBrand issuer={issuer} />
				<nav className="mt-8 grid gap-2 text-sm font-medium text-slate-300">
					{navItems.map(([icon, label, href]) => (
						<Link
							key={href}
							className="flex items-center gap-3 rounded-lg px-4 py-3 transition hover:bg-red-500/10 hover:text-red-300"
							href={href}>
							<PortalIcon name={icon} className="h-5 w-5 text-red-400" />
							{label}
						</Link>
					))}
				</nav>
				<a
					className="absolute bottom-6 left-5 right-5 rounded-lg bg-red-500 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-red-600"
					href="/api/auth/session">
					Sign Out
				</a>
			</aside>

			<div className="lg:pl-72">
				<header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/95 px-4 py-4 shadow-sm backdrop-blur lg:hidden">
					<div className="flex items-center justify-between gap-3">
						<Link href="/" className="flex items-center gap-3">
							<Image
								src="/signatura-logo.png"
								alt="Signatura logo"
								width={40}
								height={47}
								className="h-10 w-auto object-contain"
							/>
							<div>
								<p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-400">
									Signatura
								</p>
								<h1 className="text-xl font-bold text-white">Issuer Portal</h1>
							</div>
						</Link>
						<IssuerBrand issuer={issuer} compact />
						<a
							className="rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white"
							href="/api/auth/session">
							Sign Out
						</a>
					</div>
					<nav className="mt-4 flex gap-2 overflow-x-auto pb-1 text-xs font-bold text-slate-200">
						{navItems.map(([icon, label, href]) => (
							<Link
								key={href}
								className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2"
								href={href}>
								<PortalIcon name={icon} className="h-4 w-4 text-red-400" />
								{label}
							</Link>
						))}
					</nav>
				</header>
				<main className="w-full px-4 py-8 sm:px-6 lg:px-10">
					{children}
				</main>
			</div>
		</div>
	);
}
