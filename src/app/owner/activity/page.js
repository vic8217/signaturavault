import Link from 'next/link';
import { Activity, BadgeCheck, Clock, KeyRound, Send } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';

const activityItems = [
	{
		title: 'Bachelor of Science in IT viewed',
		detail: 'University of Example credential verification',
		time: 'Today, 9:24 AM',
		icon: BadgeCheck,
	},
	{
		title: 'National ID shared',
		detail: 'Secure share link created',
		time: 'Yesterday, 4:12 PM',
		icon: Send,
	},
	{
		title: 'Wallet security check',
		detail: 'Trusted device and passkey verified',
		time: 'Jun 14, 2026',
		icon: Clock,
	},
];

const APPROVAL_EVENTS = [
	'app_approval_completed',
	'accura_qr_login_approved',
	'remote_login_approved',
];

function formatActivityTime(value) {
	if (!value) return 'Recently';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return 'Recently';
	return new Intl.DateTimeFormat('en', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	}).format(date);
}

function detailValue(details, key) {
	return typeof details?.[key] === 'string' ? details[key] : '';
}

function approvalActivityForLog(log) {
	const details = log.details && typeof log.details === 'object' ? log.details : {};
	if (log.event === 'app_approval_completed') {
		const app = detailValue(details, 'app') || 'ACCURA';
		const role = detailValue(details, 'requestedRole') || 'role';
		const result = detailValue(details, 'result');
		return {
			title: `${app} role approval completed`,
			detail: `${role}${result ? ` - ${result}` : ''}`,
			time: formatActivityTime(log.createdAt),
			icon: KeyRound,
		};
	}

	if (log.event === 'accura_qr_login_approved') {
		const role = detailValue(details, 'rolePrefix') || 'ACCURA';
		const signaturaId = detailValue(details, 'signaturaId');
		return {
			title: 'ACCURA login approved',
			detail: signaturaId ? `${role} account ${signaturaId}` : `${role} account`,
			time: formatActivityTime(log.createdAt),
			icon: KeyRound,
		};
	}

	return {
		title: 'Trusted-device login approved',
		detail: 'Browser sign-in approved from this wallet',
		time: formatActivityTime(log.createdAt),
		icon: KeyRound,
	};
}

async function listApprovalActivity() {
	const session = await requireSession();
	if (!session?.userId) return [];

	const logs = await prisma.securityEventLog.findMany({
		where: {
			userId: session.userId,
			event: { in: APPROVAL_EVENTS },
		},
		orderBy: { createdAt: 'desc' },
		take: 20,
	});

	const seen = new Set();
	return logs
		.filter((log) => {
			const details = log.details && typeof log.details === 'object' ? log.details : {};
			const challengeId = detailValue(details, 'challengeId') || log.id;
			const key = `${log.event}:${challengeId}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.map(approvalActivityForLog);
}

export default async function OwnerActivityPage() {
	const approvalItems = await listApprovalActivity();
	const items = [...approvalItems, ...activityItems];

	return (
		<div className="mx-auto w-full max-w-md space-y-5 md:max-w-2xl">
			<section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
				<div className="grid h-12 w-12 place-items-center rounded-2xl bg-red-500 text-white">
					<Activity className="h-6 w-6" />
				</div>
				<h1 className="mt-5 text-2xl font-black text-white">Activity</h1>
				<p className="mt-2 text-sm leading-6 text-slate-300">
					Recent wallet sharing, viewing, and verification events appear here.
				</p>
			</section>

			<section className="grid gap-3">
				{items.map((item) => {
					const Icon = item.icon;
					return (
						<div
							key={`${item.title}-${item.time}`}
							className="flex min-h-20 items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
							<span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-red-400/30 bg-red-500/10 text-red-200">
								<Icon className="h-5 w-5" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate text-sm font-black text-white">
									{item.title}
								</span>
								<span className="mt-1 block truncate text-xs text-slate-400">
									{item.detail}
								</span>
								<span className="mt-1 block text-xs text-slate-500">
									{item.time}
								</span>
							</span>
						</div>
					);
				})}
			</section>

			<Link
				href="/owner"
				className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-bold text-white transition hover:border-red-400">
				Back to Wallet
			</Link>
		</div>
	);
}
