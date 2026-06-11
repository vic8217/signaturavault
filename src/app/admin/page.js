import { PortalIcon } from '@/components/PortalIcon';
import {
	countPlatformAnchorPool,
	countPlatformDocumentRecords,
} from '@/lib/document-records';
import { loadDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

function normalizeIdentity(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

function countRegisteredIssuers(db) {
	const issuersByIdentity = new Map();

	for (const issuer of db.issuers || []) {
		const identity =
			normalizeIdentity(issuer.registration_number) ||
			normalizeIdentity(issuer.name) ||
			issuer.id;
		const currentIssuer = issuersByIdentity.get(identity);

		if (
			!currentIssuer ||
			new Date(issuer.created_at || 0) > new Date(currentIssuer.created_at || 0)
		) {
			issuersByIdentity.set(identity, issuer);
		}
	}

	return Array.from(issuersByIdentity.values()).filter(
		(issuer) => issuer.status !== 'deleted',
	).length;
}

function countToday(records, dateField = 'created_at') {
	const today = new Date().toISOString().slice(0, 10);
	return records.filter((record) =>
		String(record[dateField] || '').startsWith(today),
	).length;
}

async function getAdminSummary(db) {
	const batches = db.merkle_batches || [];
	const apiLogs = db.api_logs || [];
	const documentCounts = await countPlatformDocumentRecords(db);
	const anchorPoolCounts = await countPlatformAnchorPool(db);

	return {
		totalIssuers: countRegisteredIssuers(db),
		activeTenants: (db.tenants || []).filter(
			(tenant) => tenant.status !== 'deleted',
		).length,
		documentsIssued: documentCounts.total,
		verificationsToday: countToday(
			apiLogs.filter((log) => String(log.path || '').includes('/verify')),
		),
		pendingAnchors: anchorPoolCounts.pending,
		batchedAnchors: anchorPoolCounts.batched,
		anchoredDocuments: documentCounts.anchored,
		anchorPending: batches.filter(
			(batch) =>
				batch.status === 'timestamped_pending_confirmation' ||
				batch.status === 'publishing',
		).length,
		publishedBatches: batches.filter((batch) => batch.status === 'published')
			.length,
		failedAnchors:
			anchorPoolCounts.failed +
			batches.filter((batch) => batch.status === 'failed').length,
	};
}

export default async function AdminDashboard() {
	const db = await loadDb();
	const summary = await getAdminSummary(db);
	const overviewCards = [
		{ icon: 'bank', label: 'Total Issuers', value: summary.totalIssuers },
		{ icon: 'shield', label: 'Active Tenants', value: summary.activeTenants },
		{
			icon: 'document',
			label: 'Documents Issued',
			value: summary.documentsIssued,
		},
		{
			icon: 'qr',
			label: 'Verifications Today',
			value: summary.verificationsToday,
		},
	];
	const anchoringCards = [
		{
			icon: 'upload',
			label: 'Pending Anchors',
			value: summary.pendingAnchors,
			helper: 'Document hashes waiting for the next Merkle batch.',
		},
		{
			icon: 'scanner',
			label: 'Anchor Pending',
			value: summary.anchorPending,
			helper: 'Merkle batches waiting to finish publishing.',
		},
		{
			icon: 'shield',
			label: 'Published Batches',
			value: summary.publishedBatches,
			helper: 'Merkle roots with confirmed public commitments.',
		},
		{
			icon: 'audit',
			label: 'Failed Anchors',
			value: summary.failedAnchors,
			helper: 'Batches or pool records needing admin retry.',
		},
	];

	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 shadow-[0_0_80px_rgba(15,23,42,0.45)]">
				<p className="text-sm font-bold uppercase tracking-[0.3em] text-red-400">
					Dev Admin
				</p>
				<h1 className="mt-4 text-3xl font-bold text-white">Admin Dashboard</h1>
				<p className="mt-4 text-slate-300">
					System overview and administrative controls for Signatura platform
					management.
				</p>
			</section>

			<div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
				{overviewCards.map((card) => (
					<div
						key={card.label}
						className="rounded-xl border border-white/10 bg-white/[0.04] p-6">
						<div className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
							<PortalIcon name={card.icon} className="h-5 w-5" />
						</div>
						<p className="text-sm text-slate-300 font-medium">{card.label}</p>
						<p className="text-3xl font-bold text-white mt-2">
							{card.value}
						</p>
					</div>
				))}
			</div>

			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-8">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="text-sm font-bold uppercase tracking-[0.3em] text-red-300">
							Anchoring
						</p>
						<h2 className="mt-3 text-2xl font-bold text-white">
							Merkle and anchor status
						</h2>
					</div>
					<a
						href="/admin/anchoring"
						className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-white transition hover:border-red-400 hover:text-red-200">
						Manage anchoring
					</a>
				</div>

				<div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					{anchoringCards.map((card) => (
						<div
							key={card.label}
							className="rounded-xl border border-white/10 bg-slate-950/50 p-5">
							<div className="mb-4 grid h-10 w-10 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
								<PortalIcon name={card.icon} className="h-5 w-5" />
							</div>
							<p className="text-sm font-medium text-slate-300">{card.label}</p>
							<p className="mt-2 text-3xl font-bold text-white">{card.value}</p>
							<p className="mt-3 text-xs leading-5 text-slate-400">
								{card.helper}
							</p>
						</div>
					))}
				</div>
			</section>

			<div className="grid md:grid-cols-2 gap-6">
				<div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8">
					<div className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
						<PortalIcon name="audit" className="h-5 w-5" />
					</div>
					<h2 className="text-xl font-bold text-white mb-4">
						Recent Activity
					</h2>
					<p className="text-slate-300">No recent activity to display.</p>
				</div>

				<div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8">
					<div className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
						<PortalIcon name="system" className="h-5 w-5" />
					</div>
					<h2 className="text-xl font-bold text-white mb-4">
						System Status
					</h2>
					<ul className="space-y-2 text-sm">
						<li className="flex items-center gap-2">
							<PortalIcon name="check" className="h-4 w-4 text-red-400" />
							<span className="text-slate-300">API: Operational</span>
						</li>
						<li className="flex items-center gap-2">
							<PortalIcon name="check" className="h-4 w-4 text-red-400" />
							<span className="text-slate-300">Database: Operational</span>
						</li>
						<li className="flex items-center gap-2">
							<PortalIcon name="check" className="h-4 w-4 text-red-400" />
							<span className="text-slate-300">
								Blockchain Sync: Operational
							</span>
						</li>
					</ul>
				</div>
			</div>
		</div>
	);
}
