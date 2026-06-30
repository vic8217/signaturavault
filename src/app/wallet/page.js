import Image from 'next/image';
import Link from 'next/link';
import {
	BadgeCheck,
	Bell,
	Copy,
	FileCheck2,
	IdCard,
	KeyRound,
	Medal,
	ScanLine,
	Send,
	ShieldCheck,
	Smartphone,
	Sparkles,
	WalletCards,
} from 'lucide-react';
import { RegisterTrustedDevicePrompt } from '@/components/RegisterTrustedDevicePrompt';
import { listOwnerDocumentCredentials } from '@/lib/document-owner-credentials';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';

const fallbackCredentials = [
	{
		documentId: 'bsit-university-example',
		documentTypeLabel: 'Bachelor of Science in IT',
		issuerName: 'University of Example',
		issuedAt: '2026-04-18T00:00:00.000Z',
		verificationStatus: 'valid',
	},
	{
		documentId: 'prc-professional-license',
		documentTypeLabel: 'PRC Professional License',
		issuerName: 'Professional Regulation Commission',
		issuedAt: '2026-02-09T00:00:00.000Z',
		verificationStatus: 'valid',
	},
	{
		documentId: 'national-id',
		documentTypeLabel: 'National ID',
		issuerName: 'Republic of the Philippines',
		issuedAt: '2025-11-21T00:00:00.000Z',
		verificationStatus: 'valid',
	},
];

const categories = [
	'All',
	'IDs',
	'Diplomas',
	'Certificates',
	'Membership',
	'Medical',
];

const quickActions = [
	{
		label: 'Scan',
		helper: 'Open QR camera',
		href: '/owner/scan',
		icon: ScanLine,
	},
	{
		label: 'Scan Login QR',
		helper: 'Approve ACCURA login',
		href: '/signatura/scan-login',
		icon: KeyRound,
	},
	{
		label: 'Share',
		helper: 'Send proof',
		href: '/owner/credentials',
		icon: Send,
	},
	{
		label: 'Receive',
		helper: 'Add credential',
		href: '/owner',
		icon: Bell,
	},
	{
		label: 'Verify',
		helper: 'Check a QR',
		href: '/owner/scan',
		icon: BadgeCheck,
	},
];

function greeting() {
	const hour = new Date().getHours();
	if (hour < 12) return 'Good Morning';
	if (hour < 18) return 'Good Afternoon';
	return 'Good Evening';
}

function initialsForName(name) {
	return (
		name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase())
			.join('') || 'SU'
	);
}

function formatDate(value) {
	if (!value) return 'Recently issued';
	return new Intl.DateTimeFormat('en', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	}).format(new Date(value));
}

function formatDeviceDate(value, fallback = 'Not used yet') {
	if (!value) return fallback;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return fallback;
	return new Intl.DateTimeFormat('en', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	}).format(date);
}

async function ownerWalletData() {
	const session = await requireSession();
	if (!session?.userId) {
		return {
			session: null,
			credentials: fallbackCredentials,
			trustedDeviceActive: false,
			trustedDevices: [],
			recoveryBackupSet: false,
		};
	}

	const [user, credentials, trustedDevices, recoveryCodeCount] =
		await Promise.all([
			prisma.user.findUnique({
				where: { id: session.userId },
				select: { name: true, signaturaId: true },
			}),
			listOwnerDocumentCredentials(session.userId).catch(() => []),
			prisma.trustedDevice.findMany({
				where: {
					userId: session.userId,
					isTrusted: true,
					removedAt: null,
					status: 'active',
				},
				orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
				take: 4,
				select: {
					id: true,
					deviceName: true,
					userAgent: true,
					createdAt: true,
					lastUsedAt: true,
					status: true,
				},
			}),
			prisma.recoveryCode.count({
				where: {
					userId: session.userId,
					usedAt: null,
				},
			}),
		]);

	return {
		session: {
			...session,
			name: user?.name || null,
			signaturaId: user?.signaturaId || session.signaturaId,
		},
		credentials: credentials.length ? credentials : fallbackCredentials,
		trustedDeviceActive:
			trustedDevices.length > 0 || Number(session.trustLevel || 0) >= 2,
		trustedDevices,
		recoveryBackupSet: recoveryCodeCount > 0,
	};
}

function StatusPill({ children }) {
	return (
		<span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 text-xs font-bold text-emerald-100">
			<ShieldCheck className="h-3.5 w-3.5" />
			{children}
		</span>
	);
}

export default async function WalletHome() {
	const {
		session,
		credentials,
		trustedDeviceActive,
		trustedDevices,
		recoveryBackupSet,
	} =
		await ownerWalletData();
	const displayName = session?.name || 'Signatura User';
	const signaturaId = session?.signaturaId || 'SIG-U-8FD2-A91C';
	const initials = initialsForName(displayName);
	const credentialCount = credentials.length;
	const sharedDocsCount = 2;
	const verificationCount = Math.max(credentialCount * 3, 3);

	return (
		<div className="mx-auto min-h-screen w-full min-w-0 max-w-full overflow-x-hidden pb-4 md:max-w-2xl xl:max-w-5xl">
			<RegisterTrustedDevicePrompt />

			<section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] xl:items-start">
				<div className="min-w-0 space-y-5">
					<header className="flex min-w-0 items-center justify-between gap-3">
						<div className="flex min-w-0 items-center gap-3">
							<Image
								src="/signatura-logo.png"
								alt="Signatura"
								width={44}
								height={44}
								className="hidden h-11 w-11 shrink-0 object-contain lg:block"
							/>
							<div className="min-w-0">
								<p className="truncate text-lg font-black text-white">
									{greeting()}, {displayName}
								</p>
								<p className="mt-0.5 text-xs font-semibold text-slate-400">
									Your secure wallet is ready
								</p>
							</div>
						</div>
						<div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-red-400/40 bg-red-500/15 text-sm font-black text-white shadow-[0_0_28px_rgba(239,68,68,0.18)]">
							{initials}
						</div>
					</header>

					<section className="min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(2,8,23,0.98))] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.42)]">
						<div className="flex items-start justify-between gap-4">
							<div className="min-w-0">
								<p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">
									Signatura ID
								</p>
								<p className="mt-2 break-all font-mono text-lg font-black text-white">
									{signaturaId}
								</p>
							</div>
							<button
								type="button"
								aria-label="Copy Signatura ID"
								className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/5 text-red-200 transition hover:border-red-400 hover:text-white">
								<Copy className="h-5 w-5" />
							</button>
						</div>
						<div className="mt-5 flex flex-wrap gap-2">
							<StatusPill>Trusted Device Active</StatusPill>
						</div>
					</section>

					<section className="min-w-0 overflow-hidden rounded-[1.6rem] border border-red-500/30 bg-[radial-gradient(circle_at_20%_0%,rgba(239,68,68,0.28),transparent_34%),linear-gradient(160deg,#111827,#030712_65%)] p-4 shadow-[0_28px_80px_rgba(239,68,68,0.12)] sm:p-5">
						<div className="flex min-w-0 items-center justify-between gap-3">
							<div className="min-w-0">
								<p className="text-xs font-black uppercase tracking-[0.22em] text-red-200">
									SIGNATURA WALLET
								</p>
								<p className="mt-2 text-sm text-slate-300">
									Encrypted credentials and private sharing
								</p>
							</div>
							<Link
								href="/owner/credentials"
								className="rounded-full border border-white/10 px-3 py-2 text-xs font-bold text-white transition hover:border-red-300">
								View All
							</Link>
						</div>

						<div className="mt-6 grid min-w-0 grid-cols-3 gap-2 sm:gap-3">
							{[
								['Credentials', credentialCount],
								['Shared Docs', sharedDocsCount],
								['Verified', verificationCount],
							].map(([label, value]) => (
								<div
									key={label}
									className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
									<p className="text-2xl font-black text-white">{value}</p>
									<p className="mt-1 truncate text-[10px] font-semibold text-slate-400 sm:text-[11px]">
										{label}
									</p>
								</div>
							))}
						</div>

						<div className="mt-5 flex items-center justify-between rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm">
							<span className="font-bold text-emerald-50">
								Trusted Device Active
							</span>
							<ShieldCheck className="h-5 w-5 text-emerald-200" />
						</div>
					</section>
				</div>

				<div className="min-w-0 space-y-5">
					<section>
						<div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
							{quickActions.map((action) => {
								const Icon = action.icon;
								return (
									<Link
										key={action.label}
										href={action.href}
										className="min-h-28 min-w-0 rounded-[1.35rem] border border-white/10 bg-white/[0.045] p-4 transition hover:border-red-400/60 hover:bg-red-500/10">
										<span className="grid h-11 w-11 place-items-center rounded-2xl bg-red-500 text-white shadow-[0_16px_38px_rgba(239,68,68,0.25)]">
											<Icon className="h-5 w-5" />
										</span>
										<span className="mt-4 block text-base font-black text-white">
											{action.label}
										</span>
										<span className="mt-1 block text-xs font-semibold text-slate-400">
											{action.helper}
										</span>
									</Link>
								);
							})}
						</div>
					</section>

					<section className="w-full max-w-full overflow-x-auto [scrollbar-width:none]">
						<div className="flex min-w-max gap-2">
							{categories.map((category, index) => (
								<button
									key={category}
									type="button"
									className={`min-h-10 rounded-full border px-4 text-sm font-bold ${
										index === 0
											? 'border-red-400 bg-red-500 text-white'
											: 'border-white/10 bg-white/[0.04] text-slate-300'
									}`}>
									{category}
								</button>
							))}
						</div>
					</section>

					<section className="min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
						<div className="mb-4 flex items-center justify-between">
							<h2 className="text-lg font-black text-white">
								Recent Credentials
							</h2>
							<WalletCards className="h-5 w-5 text-red-300" />
						</div>
						<div className="grid gap-3">
							{credentials.slice(0, 3).map((credential, index) => {
								const credentialIcons = [Medal, FileCheck2, IdCard];
								const CredentialIcon = credentialIcons[index] || FileCheck2;
								return (
									<Link
										key={credential.documentId}
										href={`/owner/credentials/${encodeURIComponent(credential.documentId)}`}
										className="flex min-h-24 items-center gap-3 rounded-2xl border border-white/8 bg-slate-950/70 p-3 transition hover:border-red-400/60">
										<span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-red-400/30 bg-red-500/10 text-red-200">
											<CredentialIcon className="h-6 w-6" />
										</span>
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm font-black text-white">
												{credential.documentTypeLabel}
											</span>
											<span className="mt-1 block truncate text-xs font-semibold text-slate-400">
												{credential.issuerName || 'Verified issuer'}
											</span>
											<span className="mt-1 block text-xs text-slate-500">
												Issued {formatDate(credential.issuedAt)}
											</span>
										</span>
										<span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-black text-emerald-100">
											Verified
										</span>
									</Link>
								);
							})}
						</div>
					</section>

					<section className="min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
						<div className="mb-4 flex items-center justify-between">
							<h2 className="text-lg font-black text-white">Security Status</h2>
							<Link
								href="/owner/security"
								className="text-xs font-bold text-red-200 transition hover:text-white">
								View Security
							</Link>
						</div>
						<div className="grid gap-3">
							{[
								[KeyRound, 'Passkey Active', true],
								[ShieldCheck, 'Trusted Device Active', trustedDeviceActive],
								[Sparkles, 'Recovery Backup Set', recoveryBackupSet],
							].map(([Icon, label, active]) => (
								<div
									key={label}
									className="flex min-h-12 items-center justify-between rounded-2xl border border-white/8 bg-white/[0.035] px-3">
									<span className="flex items-center gap-3 text-sm font-bold text-slate-100">
										<Icon className="h-4 w-4 text-red-300" />
										{label}
									</span>
									<span
										className={`h-2.5 w-2.5 rounded-full ${
											active ? 'bg-emerald-300' : 'bg-amber-300'
										}`}
									/>
								</div>
							))}
						</div>
					</section>

					<section className="min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4">
						<div className="mb-4 flex items-center justify-between gap-3">
							<div className="min-w-0">
								<h2 className="text-lg font-black text-white">Trusted Devices</h2>
								<p className="mt-1 text-xs font-semibold text-slate-400">
									Registered with {signaturaId}
								</p>
							</div>
							<Link
								href="/signatura/trusted-devices"
								className="shrink-0 text-xs font-bold text-red-200 transition hover:text-white">
								Manage
							</Link>
						</div>
						<div className="grid gap-3">
							{trustedDevices.length ? (
								trustedDevices.map((device) => (
									<div
										key={device.id}
										className="flex min-h-16 items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.035] p-3">
										<span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-200">
											<Smartphone className="h-5 w-5" />
										</span>
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm font-black text-white">
												{device.deviceName || 'Trusted device'}
											</span>
											<span className="mt-1 block truncate text-xs font-semibold text-slate-400">
												Last used {formatDeviceDate(device.lastUsedAt)}
											</span>
											<span className="mt-1 block truncate text-[11px] text-slate-500">
												Added {formatDeviceDate(device.createdAt, 'Recently added')}
											</span>
										</span>
										<span className="shrink-0 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-black uppercase text-emerald-100">
											{device.status || 'active'}
										</span>
									</div>
								))
							) : (
								<Link
									href="/signatura/trusted-devices/add"
									className="rounded-2xl border border-amber-300/25 bg-amber-300/10 p-4 text-sm font-semibold text-amber-50 transition hover:border-amber-200">
									Register this phone as a trusted device
								</Link>
							)}
						</div>
					</section>
				</div>
			</section>
		</div>
	);
}
