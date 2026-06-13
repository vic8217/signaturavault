'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PortalIcon } from '@/components/PortalIcon';

const STATUS_FILTERS = [
	{ value: 'pending', label: 'Pending' },
	{ value: 'approved', label: 'Approved' },
	{ value: 'denied', label: 'Denied' },
	{ value: 'issued', label: 'Issued' },
];

const STATUS_STYLES = {
	pending: 'border-amber-400/30 bg-amber-400/10 text-amber-100',
	approved: 'border-sky-400/30 bg-sky-400/10 text-sky-100',
	denied: 'border-red-400/30 bg-red-400/10 text-red-100',
	issued: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
};

function formatTimestamp(value) {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '—';
	return date.toLocaleString();
}

function StatusBadge({ status }) {
	return (
		<span
			className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${
				STATUS_STYLES[status] || 'border-white/10 bg-white/4 text-slate-200'
			}`}>
			{status}
		</span>
	);
}

export function IssuerRequestsPanel() {
	const [requests, setRequests] = useState([]);
	const [selectedId, setSelectedId] = useState('');
	const [detail, setDetail] = useState(null);
	const [statusFilter, setStatusFilter] = useState('pending');
	const [loading, setLoading] = useState(true);
	const [detailLoading, setDetailLoading] = useState(false);
	const [actionLoading, setActionLoading] = useState('');
	const [error, setError] = useState('');
	const [statusMessage, setStatusMessage] = useState('');
	const [denialReason, setDenialReason] = useState('');
	const [documentRecordId, setDocumentRecordId] = useState('');
	const [documentHash, setDocumentHash] = useState('');
	const [walletDeliveryAvailable, setWalletDeliveryAvailable] = useState(false);

	const canLinkDocument = useMemo(
		() => Boolean(documentRecordId.trim() || documentHash.trim()),
		[documentHash, documentRecordId],
	);

	const filteredRequests = useMemo(() => {
		if (!statusFilter) return requests;
		return requests.filter((request) => request.status === statusFilter);
	}, [requests, statusFilter]);

	const selectedSummary = useMemo(
		() => filteredRequests.find((request) => request.requestId === selectedId) || null,
		[filteredRequests, selectedId],
	);

	const loadRequests = useCallback(async (status = statusFilter) => {
		const query = status ? `?status=${encodeURIComponent(status)}` : '';
		const response = await fetch(`/api/issuer/requests${query}`);
		const data = await response.json();
		if (!response.ok) {
			throw new Error(data.error || 'Unable to load document requests');
		}
		setRequests(Array.isArray(data.requests) ? data.requests : []);
	}, [statusFilter]);

	const loadDetail = useCallback(async (requestId) => {
		if (!requestId) {
			setDetail(null);
			return;
		}

		setDetailLoading(true);
		setError('');
		try {
			const response = await fetch(
				`/api/issuer/requests/${encodeURIComponent(requestId)}`,
			);
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || 'Unable to load request detail');
			}
			setDetail(data.request || null);
		} catch (loadError) {
			setDetail(null);
			setError(loadError.message);
		} finally {
			setDetailLoading(false);
		}
	}, []);

	useEffect(() => {
		let mounted = true;

		async function bootstrap() {
			setLoading(true);
			setError('');
			try {
				await loadRequests(statusFilter);
			} catch (loadError) {
				if (!mounted) return;
				setError(loadError.message);
			} finally {
				if (mounted) setLoading(false);
			}
		}

		bootstrap();
		return () => {
			mounted = false;
		};
	}, [loadRequests, statusFilter]);

	useEffect(() => {
		if (!selectedId && filteredRequests.length) {
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setSelectedId(filteredRequests[0].requestId);
		}
		if (selectedId && !filteredRequests.some((item) => item.requestId === selectedId)) {
			setSelectedId(filteredRequests[0]?.requestId || '');
		}
	}, [filteredRequests, selectedId]);

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		loadDetail(selectedId);
	}, [loadDetail, selectedId]);

	async function refreshAfterAction(requestId) {
		await loadRequests(statusFilter);
		if (requestId) {
			await loadDetail(requestId);
		}
	}

	async function handleApprove() {
		if (!selectedId) return;
		setActionLoading('approve');
		setStatusMessage('');
		setError('');
		try {
			const response = await fetch(
				`/api/issuer/requests/${encodeURIComponent(selectedId)}/approve`,
				{ method: 'POST' },
			);
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || 'Unable to approve request');
			}
			setStatusMessage('Request approved.');
			await refreshAfterAction(selectedId);
		} catch (actionError) {
			setError(actionError.message);
		} finally {
			setActionLoading('');
		}
	}

	async function handleDeny() {
		if (!selectedId) return;
		setActionLoading('deny');
		setStatusMessage('');
		setError('');
		try {
			const response = await fetch(
				`/api/issuer/requests/${encodeURIComponent(selectedId)}/deny`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ denialReason }),
				},
			);
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || 'Unable to deny request');
			}
			setStatusMessage('Request denied.');
			setDenialReason('');
			await refreshAfterAction(selectedId);
		} catch (actionError) {
			setError(actionError.message);
		} finally {
			setActionLoading('');
		}
	}

	async function handleIssue() {
		if (!selectedId) return;
		setActionLoading('issue');
		setStatusMessage('');
		setError('');
		try {
			const response = await fetch(
				`/api/issuer/requests/${encodeURIComponent(selectedId)}/issue`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						documentRecordId: documentRecordId.trim() || undefined,
						documentHash: documentHash.trim() || undefined,
						walletDeliveryAvailable: canLinkDocument ? walletDeliveryAvailable : false,
					}),
				},
			);
			const data = await response.json();
			if (!response.ok) {
				throw new Error(data.error || 'Unable to mark request issued');
			}
			setStatusMessage('Request marked as issued.');
			await refreshAfterAction(selectedId);
		} catch (actionError) {
			setError(actionError.message);
		} finally {
			setActionLoading('');
		}
	}

	const activeStatus = detail?.status || selectedSummary?.status || '';
	const canApprove = activeStatus === 'pending';
	const canDeny = activeStatus === 'pending' || activeStatus === 'approved';
	const canIssue = activeStatus === 'approved';

	return (
		<div className="space-y-6">
			<div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
				Private request details are decrypted only for authorized issuer staff.
			</div>

			<div className="flex flex-wrap gap-2">
				{STATUS_FILTERS.map((filter) => (
					<button
						key={filter.value}
						type="button"
						onClick={() => setStatusFilter(filter.value)}
						className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
							statusFilter === filter.value
								? 'border-red-400/40 bg-red-500/15 text-red-100'
								: 'border-white/10 bg-white/4 text-slate-300 hover:border-white/20'
						}`}>
						{filter.label}
					</button>
				))}
			</div>

			{error ? (
				<div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
					{error}
				</div>
			) : null}
			{statusMessage ? (
				<div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
					{statusMessage}
				</div>
			) : null}

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
				<section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
					<div className="mb-4 flex items-center justify-between gap-3">
						<h2 className="text-lg font-bold text-white">Request inbox</h2>
						<span className="text-xs text-slate-500">{filteredRequests.length} shown</span>
					</div>

					{loading ? (
						<p className="text-sm text-slate-400">Loading requests…</p>
					) : filteredRequests.length === 0 ? (
						<p className="text-sm text-slate-400">No requests in this filter.</p>
					) : (
						<ul className="space-y-2">
							{filteredRequests.map((request) => {
								const isSelected = request.requestId === selectedId;
								return (
									<li key={request.requestId}>
										<button
											type="button"
											onClick={() => setSelectedId(request.requestId)}
											className={`w-full rounded-xl border px-4 py-3 text-left transition ${
												isSelected
													? 'border-red-400/40 bg-red-500/10'
													: 'border-white/10 bg-slate-950/40 hover:border-white/20'
											}`}>
											<div className="flex items-start justify-between gap-3">
												<div>
													<p className="font-semibold text-white">
														{request.referenceCode}
													</p>
													<p className="mt-1 text-xs text-slate-400">
														{request.documentTypeLabel || 'Document request'}
													</p>
													<p className="mt-1 text-xs text-slate-500">
														{request.ownerDisplayLabel || 'Owner'}
													</p>
												</div>
												<StatusBadge status={request.status} />
											</div>
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</section>

				<section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
					<div className="mb-4 flex items-center gap-2">
						<PortalIcon name="document" className="h-5 w-5 text-red-400" />
						<h2 className="text-lg font-bold text-white">Request detail</h2>
					</div>

					{!selectedId ? (
						<p className="text-sm text-slate-400">Select a request to review details.</p>
					) : detailLoading ? (
						<p className="text-sm text-slate-400">Loading decrypted detail…</p>
					) : detail ? (
						<div className="space-y-5">
							<div className="grid gap-3 sm:grid-cols-2">
								<div>
									<p className="text-xs uppercase tracking-wide text-slate-500">
										Reference
									</p>
									<p className="text-sm font-semibold text-white">
										{detail.referenceCode}
									</p>
								</div>
								<div>
									<p className="text-xs uppercase tracking-wide text-slate-500">
										Status
									</p>
									<div className="mt-1">
										<StatusBadge status={detail.status} />
									</div>
								</div>
								<div>
									<p className="text-xs uppercase tracking-wide text-slate-500">
										Owner
									</p>
									<p className="text-sm text-slate-200">
										{detail.ownerDisplayLabel || 'Owner'}
									</p>
								</div>
								<div>
									<p className="text-xs uppercase tracking-wide text-slate-500">
										Document type
									</p>
									<p className="text-sm text-slate-200">
										{detail.documentTypeLabel || '—'}
									</p>
								</div>
								<div>
									<p className="text-xs uppercase tracking-wide text-slate-500">
										Submitted
									</p>
									<p className="text-sm text-slate-200">
										{formatTimestamp(detail.submittedAt)}
									</p>
								</div>
								<div>
									<p className="text-xs uppercase tracking-wide text-slate-500">
										Updated
									</p>
									<p className="text-sm text-slate-200">
										{formatTimestamp(detail.updatedAt)}
									</p>
								</div>
							</div>

							<div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
								<h3 className="text-sm font-bold text-white">Private request fields</h3>
								<dl className="mt-3 space-y-3 text-sm">
									<div>
										<dt className="text-xs uppercase tracking-wide text-slate-500">
											Purpose
										</dt>
										<dd className="mt-1 text-slate-200">
											{detail.privateFields?.purpose || '—'}
										</dd>
									</div>
									<div>
										<dt className="text-xs uppercase tracking-wide text-slate-500">
											Private reference
										</dt>
										<dd className="mt-1 text-slate-200">
											{detail.privateFields?.privateReference || '—'}
										</dd>
									</div>
									<div>
										<dt className="text-xs uppercase tracking-wide text-slate-500">
											Notes
										</dt>
										<dd className="mt-1 whitespace-pre-wrap text-slate-200">
											{detail.privateFields?.notes || '—'}
										</dd>
									</div>
									{detail.privateFields?.denialReason ? (
										<div>
											<dt className="text-xs uppercase tracking-wide text-slate-500">
												Denial reason
											</dt>
											<dd className="mt-1 whitespace-pre-wrap text-slate-200">
												{detail.privateFields.denialReason}
											</dd>
										</div>
									) : null}
								</dl>
							</div>

							<div className="flex flex-wrap gap-3">
								{canApprove ? (
									<button
										type="button"
										onClick={handleApprove}
										disabled={actionLoading === 'approve'}
										className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60">
										{actionLoading === 'approve' ? 'Approving…' : 'Approve'}
									</button>
								) : null}
								{canDeny ? (
									<div className="flex min-w-[16rem] flex-1 flex-col gap-2 sm:flex-row sm:items-end">
										<label className="flex-1 text-sm text-slate-300">
											<span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
												Denial reason
											</span>
											<input
												type="text"
												value={denialReason}
												onChange={(event) => setDenialReason(event.target.value)}
												placeholder="Reason shown only to issuer staff"
												className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400/50"
											/>
										</label>
										<button
											type="button"
											onClick={handleDeny}
											disabled={actionLoading === 'deny' || !denialReason.trim()}
											className="rounded-lg border border-red-400/40 bg-red-500/15 px-4 py-2 text-sm font-bold text-red-100 transition hover:bg-red-500/25 disabled:opacity-60">
											{actionLoading === 'deny' ? 'Denying…' : 'Deny'}
										</button>
									</div>
								) : null}
							</div>

							{canIssue ? (
								<div className="rounded-xl border border-white/10 bg-slate-950/40 p-4">
									<h3 className="text-sm font-bold text-white">Mark issued</h3>
									<p className="mt-2 text-xs text-slate-400">
										Leave both fields empty to mark issuer release only. Provide a
										record ID or document hash to link a credential to the owner.
									</p>
									<div className="mt-3 grid gap-3 sm:grid-cols-2">
										<label className="text-sm text-slate-300">
											<span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
												Link existing document record
											</span>
											<input
												type="text"
												value={documentRecordId}
												onChange={(event) => {
													setDocumentRecordId(event.target.value);
													if (event.target.value.trim()) setDocumentHash('');
												}}
												placeholder="Existing Prisma document record ID"
												className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400/50"
											/>
										</label>
										<label className="text-sm text-slate-300">
											<span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
												Or create from document hash
											</span>
											<input
												type="text"
												value={documentHash}
												onChange={(event) => {
													setDocumentHash(event.target.value);
													if (event.target.value.trim()) setDocumentRecordId('');
												}}
												placeholder="SHA-256 document hash"
												className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-red-400/50"
											/>
										</label>
										<label className="flex items-center gap-2 text-sm text-slate-300 sm:col-span-2">
											<input
												type="checkbox"
												checked={walletDeliveryAvailable}
												disabled={!canLinkDocument}
												onChange={(event) =>
													setWalletDeliveryAvailable(event.target.checked)
												}
												className="h-4 w-4 rounded border-white/20 bg-slate-950 disabled:opacity-50"
											/>
											Deliver to owner Signatura wallet
										</label>
									</div>
									<button
										type="button"
										onClick={handleIssue}
										disabled={actionLoading === 'issue'}
										className="mt-4 rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600 disabled:opacity-60">
										{actionLoading === 'issue' ? 'Saving…' : 'Mark issued'}
									</button>
								</div>
							) : null}
						</div>
					) : (
						<p className="text-sm text-slate-400">Unable to load request detail.</p>
					)}
				</section>
			</div>
		</div>
	);
}
