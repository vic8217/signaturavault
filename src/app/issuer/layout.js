import Image from 'next/image';
import Link from 'next/link';
import { PortalIcon } from '@/components/PortalIcon';
import { getActiveIssuerProfile } from '@/lib/issuer-profile';

const navItems = [
	['dashboard', 'Dashboard', '/issuer'],
	['document', 'Requests', '/issuer/requests'],
	['document', 'Issuance', '/issuer/issuance'],
	['identity', 'Digital Documents', '/issuer/digital-documents'],
	['template', 'Templates', '/issuer/templates'],
	['shield', 'Revocation', '/issuer/revocation'],
	['api', 'API', '/issuer/api'],
	['identity', 'Profile', '/issuer/profile'],
];

const comingSoonNavItems = [
	['audit', 'Verification logs coming soon'],
];

const issuerLogoutHref = `/api/auth/logout?redirect=${encodeURIComponent('/login?next=/issuer')}`;

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
			className={`flex items-center gap-3 rounded-xl border border-white/10 bg-white/4 ${
				compact ? 'px-3 py-2' : 'mt-6 px-4 py-3'
			}`}>
			{issuer.logoUrl ? (
				<Image
					src={issuer.logoUrl}
					alt={`${issuer.name} logo`}
					width={40}
					height={40}
					unoptimized
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

function IssuerNavLink({ icon, label, href, compact = false }) {
	return (
		<Link
			className={`flex items-center gap-3 rounded-lg transition hover:bg-red-500/10 hover:text-red-300 ${
				compact
					? 'shrink-0 gap-2 border border-white/10 bg-white/4 px-3 py-2 text-xs font-bold text-slate-200'
					: 'px-4 py-3 text-sm font-medium text-slate-300'
			}`}
			href={href}>
			<PortalIcon
				name={icon}
				className={`text-red-400 ${compact ? 'h-4 w-4' : 'h-5 w-5'}`}
			/>
			{label}
		</Link>
	);
}

function IssuerNavComingSoon({ icon, label, compact = false }) {
	return (
		<div
			aria-disabled="true"
			title={label}
			className={`flex cursor-not-allowed items-center gap-3 rounded-lg opacity-60 ${
				compact
					? 'shrink-0 gap-2 border border-white/10 bg-slate-950/40 px-3 py-2 text-xs font-bold text-slate-500'
					: 'px-4 py-3 text-sm font-medium text-slate-500'
			}`}>
			<PortalIcon
				name={icon}
				className={`text-slate-600 ${compact ? 'h-4 w-4' : 'h-5 w-5'}`}
			/>
			<span className={compact ? 'max-w-[9rem] truncate' : ''}>{label}</span>
		</div>
	);
}

export default async function IssuerLayout({ children }) {
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
				<nav className="mt-8 grid gap-2">
					{navItems.map(([icon, label, href]) => (
						<IssuerNavLink key={href} icon={icon} label={label} href={href} />
					))}
					{comingSoonNavItems.map(([icon, label]) => (
						<IssuerNavComingSoon key={label} icon={icon} label={label} />
					))}
				</nav>
				<a
					className="absolute bottom-6 left-5 right-5 rounded-lg bg-red-500 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-red-600"
					href={issuerLogoutHref}>
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
							href={issuerLogoutHref}>
							Sign Out
						</a>
					</div>
					<nav className="mt-4 flex gap-2 overflow-x-auto pb-1">
						{navItems.map(([icon, label, href]) => (
							<IssuerNavLink
								key={href}
								icon={icon}
								label={label}
								href={href}
								compact
							/>
						))}
						{comingSoonNavItems.map(([icon, label]) => (
							<IssuerNavComingSoon
								key={label}
								icon={icon}
								label={label}
								compact
							/>
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
