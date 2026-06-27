import { PortalIcon } from '@/components/PortalIcon';
import { getSignaturaAccountType } from '@/lib/identity';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const TYPE_LABELS = {
	admin: 'Legacy Admin',
	issuer: 'Legacy Issuer',
	user: 'Universal User',
	accura: 'ACCURA Legacy',
};

function formatDate(value) {
	if (!value) return 'Unknown';
	return new Intl.DateTimeFormat('en', {
		year: 'numeric',
		month: 'short',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	}).format(new Date(value));
}

function classifySignaturaId(signaturaId) {
	const normalized = String(signaturaId || '').toUpperCase();
	if (normalized.startsWith('SIG-ACCURA-')) return 'accura';
	return getSignaturaAccountType(normalized);
}

function summarizeContexts(memberships = []) {
	const labels = memberships.flatMap((membership) => {
		const app = membership.application?.code || membership.application?.name || 'APP';
		const org = membership.organization?.name || membership.organization?.id || '';
		return (membership.roles || []).map((entry) => {
			const role = entry.role?.code || entry.role?.name || 'ROLE';
			return org ? `${app} / ${org} / ${role}` : `${app} / ${role}`;
		});
	});
	return labels.length ? labels : ['No active role'];
}

function countBy(items, resolver) {
	return items.reduce((counts, item) => {
		const key = resolver(item);
		counts[key] = (counts[key] || 0) + 1;
		return counts;
	}, {});
}

async function getSignaturaIdSummary() {
	const users = await prisma.user.findMany({
		orderBy: { createdAt: 'desc' },
		select: {
			id: true,
			signaturaId: true,
			accountStatus: true,
			trustLevel: true,
			createdAt: true,
			_count: {
				select: {
					credentials: true,
					trustedDevices: true,
					recoveryCodes: true,
				},
			},
			memberships: {
				where: { status: 'ACTIVE' },
				select: {
					id: true,
					application: {
						select: { code: true, name: true },
					},
					organization: {
						select: { id: true, name: true, type: true },
					},
					roles: {
						select: {
							role: {
								select: { code: true, name: true, scope: true },
							},
						},
					},
				},
				orderBy: { createdAt: 'asc' },
			},
		},
	});

	const enriched = users.map((user) => ({
		...user,
		type: classifySignaturaId(user.signaturaId),
		contexts: summarizeContexts(user.memberships),
	}));

	return {
		total: enriched.length,
		byType: countBy(enriched, (user) => user.type),
		byStatus: countBy(enriched, (user) => user.accountStatus || 'unknown'),
		recent: enriched.slice(0, 100),
	};
}

function StatCard({ icon, label, value, helper }) {
	return (
		<div className="rounded-xl border border-white/10 bg-white/4 p-6">
			<div className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
				<PortalIcon name={icon} className="h-5 w-5" />
			</div>
			<p className="text-sm font-medium text-slate-300">{label}</p>
			<p className="mt-2 text-3xl font-bold text-white">{value}</p>
			{helper ? (
				<p className="mt-3 text-xs leading-5 text-slate-400">{helper}</p>
			) : null}
		</div>
	);
}

function StatusPill({ children }) {
	return (
		<span className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-emerald-100">
			{children}
		</span>
	);
}

export default async function AdminSignaturaIdsPage() {
	const summary = await getSignaturaIdSummary();
	const typeCards = [
		['identity', 'Universal Users', summary.byType.user || 0],
		['lock', 'Legacy Admin IDs', summary.byType.admin || 0],
		['bank', 'Legacy Issuer IDs', summary.byType.issuer || 0],
		['api', 'ACCURA Legacy IDs', summary.byType.accura || 0],
	];

	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/4 p-10 shadow-[0_0_80px_rgba(15,23,42,0.45)]">
				<p className="text-sm font-bold uppercase tracking-[0.3em] text-red-400">
					Identity Registry
				</p>
				<h1 className="mt-4 text-3xl font-bold text-white">
					Signatura IDs created
				</h1>
				<p className="mt-4 max-w-3xl text-slate-300">
					Summary of created Signatura identities and role contexts. Private
					contact fields remain encrypted and are not shown here.
				</p>
			</section>

			<div className="grid gap-6 md:grid-cols-2 xl:grid-cols-5">
				<StatCard
					icon="shield"
					label="Total Signatura IDs"
					value={summary.total}
					helper="All identities in the users table."
				/>
				{typeCards.map(([icon, label, value]) => (
					<StatCard key={label} icon={icon} label={label} value={value} />
				))}
			</div>

			<section className="rounded-2xl border border-white/10 bg-white/4 p-8">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="text-sm font-bold uppercase tracking-[0.3em] text-red-300">
							Account Status
						</p>
						<h2 className="mt-3 text-2xl font-bold text-white">
							Status distribution
						</h2>
					</div>
				</div>
				<div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					{Object.entries(summary.byStatus).map(([status, count]) => (
						<div
							key={status}
							className="rounded-xl border border-white/10 bg-slate-950/50 p-5">
							<p className="text-sm font-medium uppercase tracking-[0.12em] text-slate-400">
								{status}
							</p>
							<p className="mt-2 text-3xl font-bold text-white">{count}</p>
						</div>
					))}
				</div>
			</section>

			<section className="rounded-2xl border border-white/10 bg-white/4 p-8">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="text-sm font-bold uppercase tracking-[0.3em] text-red-300">
							Recent Identities
						</p>
						<h2 className="mt-3 text-2xl font-bold text-white">
							Latest Signatura IDs
						</h2>
					</div>
					<p className="text-sm text-slate-400">Showing latest 100</p>
				</div>

				<div className="mt-6 overflow-x-auto rounded-xl border border-white/10">
					<table className="min-w-full divide-y divide-white/10 text-left text-sm">
						<thead className="bg-slate-950/70 text-xs uppercase tracking-[0.18em] text-slate-400">
							<tr>
								<th className="px-5 py-4">Signatura ID</th>
								<th className="px-5 py-4">Type</th>
								<th className="px-5 py-4">Status</th>
								<th className="px-5 py-4">Trust</th>
								<th className="px-5 py-4">Security</th>
								<th className="px-5 py-4">Contexts</th>
								<th className="px-5 py-4">Created</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-white/10">
							{summary.recent.map((user) => (
								<tr key={user.id} className="align-top">
									<td className="px-5 py-4 font-mono font-bold text-white">
										{user.signaturaId}
									</td>
									<td className="px-5 py-4 text-slate-300">
										{TYPE_LABELS[user.type] || user.type}
									</td>
									<td className="px-5 py-4">
										<StatusPill>{user.accountStatus || 'unknown'}</StatusPill>
									</td>
									<td className="px-5 py-4 text-slate-300">
										Level {user.trustLevel || 1}
									</td>
									<td className="px-5 py-4 text-slate-300">
										<div className="grid gap-1">
											<span>{user._count.credentials} passkey(s)</span>
											<span>{user._count.trustedDevices} trusted device(s)</span>
											<span>{user._count.recoveryCodes} recovery code(s)</span>
										</div>
									</td>
									<td className="px-5 py-4 text-slate-300">
										<div className="grid max-w-md gap-2">
											{user.contexts.slice(0, 4).map((context) => (
												<span
													key={context}
													className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-xs">
													{context}
												</span>
											))}
											{user.contexts.length > 4 ? (
												<span className="text-xs text-slate-500">
													+{user.contexts.length - 4} more
												</span>
											) : null}
										</div>
									</td>
									<td className="px-5 py-4 text-slate-400">
										{formatDate(user.createdAt)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}
