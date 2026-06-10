'use client';

import { useEffect, useMemo, useState } from 'react';
import { PortalIcon } from '@/components/PortalIcon';

const documentStatusOptions = [
	{ value: 'all', label: 'All document statuses' },
	{ value: 'valid', label: 'Valid' },
	{ value: 'revoked', label: 'Revoked' },
	{ value: 'expired', label: 'Expired' },
	{ value: 'superseded', label: 'Superseded' },
];

const anchorStatusOptions = [
	{ value: 'all', label: 'All anchor statuses' },
	{ value: 'pending', label: 'Pending anchor' },
	{ value: 'batched', label: 'Batched' },
	{ value: 'timestamped_pending_confirmation', label: 'Legacy anchor pending' },
	{ value: 'published', label: 'Published' },
	{ value: 'failed', label: 'Failed' },
];

const statusLabels = {
	valid: 'Valid',
	revoked: 'Revoked',
	expired: 'Expired',
	superseded: 'Superseded',
	pending: 'Pending',
	batched: 'Batched',
	published: 'Published',
	failed: 'Failed',
	timestamped_pending_confirmation: 'Legacy anchor pending',
	created: 'Created',
	publishing: 'Publishing',
};

function formatStatus(value) {
	return statusLabels[value] || String(value || 'Unknown').replaceAll('_', ' ');
}

function formatDate(value) {
	if (!value) return 'Not issued';
	return new Intl.DateTimeFormat('en', {
		year: 'numeric',
		month: 'short',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	}).format(new Date(value));
}

function statusClass(value) {
	if (value === 'published' || value === 'valid') {
		return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100';
	}
	if (value === 'timestamped_pending_confirmation' || value === 'batched') {
		return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
	}
	if (value === 'failed' || value === 'revoked' || value === 'expired') {
		return 'border-red-400/30 bg-red-400/10 text-red-100';
	}
	return 'border-white/10 bg-slate-950/60 text-slate-200';
}

function shortValue(value) {
	if (!value) return 'None';
	if (value.length <= 20) return value;
	return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function SummaryTile({ icon, label, value, tone = 'slate' }) {
	const tones = {
		red: 'border-red-400/30 bg-red-500/10 text-red-200',
		amber: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
		emerald: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
		slate: 'border-white/10 bg-white/[0.04] text-slate-200',
	};

	return (
		<div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
			<div
				className={`grid h-10 w-10 place-items-center rounded-xl border ${tones[tone]}`}>
				<PortalIcon name={icon} className="h-5 w-5" />
			</div>
			<p className="mt-4 text-sm text-slate-400">{label}</p>
			<p className="mt-1 text-3xl font-bold text-white">{value}</p>
		</div>
	);
}

export function IssuerDocumentSummary() {
	const [data, setData] = useState({
		summary: {
			totalIssued: 0,
			valid: 0,
			revoked: 0,
			pendingAnchor: 0,
			timestampPending: 0,
			published: 0,
			failed: 0,
		},
		filteredCount: 0,
		documents: [],
	});
	const [search, setSearch] = useState('');
	const [documentStatus, setDocumentStatus] = useState('all');
	const [anchorPublishStatus, setAnchorPublishStatus] = useState('all');
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState('');

	const query = useMemo(() => {
		const params = new URLSearchParams();
		if (search.trim()) params.set('search', search.trim());
		if (documentStatus !== 'all') params.set('status', documentStatus);
		if (anchorPublishStatus !== 'all') params.set('anchorStatus', anchorPublishStatus);
		return params.toString();
	}, [search, documentStatus, anchorPublishStatus]);

	useEffect(() => {
		let ignore = false;

		async function loadDocuments() {
			setIsLoading(true);
			setError('');
			try {
				const response = await fetch(`/api/issuer/documents${query ? `?${query}` : ''}`);
				const body = await response.json();
				if (!response.ok) throw new Error(body.error || 'Unable to load documents');
				if (!ignore) setData(body);
			} catch (loadError) {
				if (!ignore) setError(loadError.message);
			} finally {
				if (!ignore) setIsLoading(false);
			}
		}

		loadDocuments();
		return () => {
			ignore = true;
		};
	}, [query]);

	const summary = data.summary;

	return (
		<section className="space-y-5">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-300">
						Issued Documents
					</p>
					<h2 className="mt-3 text-2xl font-bold text-white">
						Document issuance and anchor status
					</h2>
					<p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
						Track issued records, revocation state, Merkle inclusion, and audit
						anchor commitments from the issuer dashboard.
					</p>
				</div>
				<p className="text-sm text-slate-400">
					Showing {data.filteredCount} of {summary.totalIssued} issued documents
				</p>
			</div>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
				<SummaryTile icon="document" label="Total issued" value={summary.totalIssued} />
				<SummaryTile icon="check" label="Valid" value={summary.valid} tone="emerald" />
				<SummaryTile
					icon="upload"
					label="Pending anchor"
					value={summary.pendingAnchor}
					tone="amber"
				/>
				<SummaryTile
					icon="scanner"
					label="Anchor pending"
					value={summary.timestampPending}
					tone="amber"
				/>
				<SummaryTile icon="shield" label="Published" value={summary.published} tone="red" />
				<SummaryTile icon="audit" label="Failed" value={summary.failed} tone="red" />
			</div>

			<div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
				<div className="grid gap-3 lg:grid-cols-[1fr_220px_240px]">
					<label className="block">
						<span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
							Search
						</span>
						<input
							type="search"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Search recipient, document ID, external ID, batch, or hash"
							className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-red-400"
						/>
					</label>
					<label className="block">
						<span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
							Document status
						</span>
						<select
							value={documentStatus}
							onChange={(event) => setDocumentStatus(event.target.value)}
							className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-red-400">
							{documentStatusOptions.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</label>
					<label className="block">
						<span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
							Anchor status
						</span>
						<select
							value={anchorPublishStatus}
							onChange={(event) => setAnchorPublishStatus(event.target.value)}
							className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition focus:border-red-400">
							{anchorStatusOptions.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</label>
				</div>

				{error ? (
					<p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
						{error}
					</p>
				) : null}

				<div className="mt-5 overflow-hidden rounded-xl border border-white/10">
					<div className="overflow-x-auto">
						<table className="w-full min-w-[1060px] text-left text-sm">
							<thead className="bg-slate-950/80 text-xs uppercase tracking-[0.18em] text-slate-400">
								<tr>
									<th className="px-4 py-3">Document</th>
									<th className="px-4 py-3">Recipient</th>
									<th className="px-4 py-3">Document status</th>
									<th className="px-4 py-3">Anchor status</th>
									<th className="px-4 py-3">Batch</th>
									<th className="px-4 py-3">Hash</th>
									<th className="px-4 py-3">Issued</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-white/10">
								{data.documents.map((document) => (
									<tr key={document.id}>
										<td className="px-4 py-4">
											<p className="font-semibold text-white">
												{document.externalId || shortValue(document.id)}
											</p>
											<p className="mt-1 font-mono text-xs text-slate-500">
												{shortValue(document.id)}
											</p>
										</td>
										<td className="px-4 py-4 text-slate-300">
											{document.recipientName || 'Not set'}
										</td>
										<td className="px-4 py-4">
											<span
												className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(
													document.documentStatus,
												)}`}>
												{formatStatus(document.documentStatus)}
											</span>
										</td>
										<td className="px-4 py-4">
											<span
												className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClass(
													document.anchorPublishStatus,
												)}`}>
												{formatStatus(document.anchorPublishStatus)}
											</span>
											<p className="mt-2 text-xs text-slate-500">
												{document.publishMethod
													? `${document.publishMethod}${
															document.anchorCommitmentAvailable ? ' anchor ready' : ''
														}`
													: formatStatus(document.anchorStatus)}
											</p>
										</td>
										<td className="px-4 py-4 font-mono text-xs text-slate-300">
											{shortValue(document.batchId)}
										</td>
										<td className="px-4 py-4 font-mono text-xs text-slate-300">
											{document.documentHash || 'None'}
										</td>
										<td className="px-4 py-4 text-slate-300">
											{formatDate(document.issuedAt)}
										</td>
									</tr>
								))}
								{!isLoading && data.documents.length === 0 ? (
									<tr>
										<td colSpan={7} className="px-4 py-10 text-center text-slate-400">
											No issued documents match the current filters.
										</td>
									</tr>
								) : null}
								{isLoading ? (
									<tr>
										<td colSpan={7} className="px-4 py-10 text-center text-slate-400">
											Loading issued documents...
										</td>
									</tr>
								) : null}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		</section>
	);
}
