'use client';

import { useEffect, useState } from 'react';

function shortValue(value) {
	if (!value) return 'None';
	if (value.length <= 18) return value;
	return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function AdminAnchoringPanel() {
	const [data, setData] = useState({
		pendingAnchorCount: 0,
		failedAnchorCount: 0,
		latestBatches: [],
	});
	const [status, setStatus] = useState('Loading anchoring status...');
	const [error, setError] = useState('');
	const [isBusy, setIsBusy] = useState(false);
	const [verifyResult, setVerifyResult] = useState(null);

	async function loadAnchoring() {
		setError('');
		try {
			const response = await fetch('/api/admin/anchoring');
			const body = await response.json();
			if (!response.ok) throw new Error(body.error || 'Unable to load anchoring status');
			setData(body);
			setStatus('');
		} catch (loadError) {
			setError(loadError.message);
			setStatus('');
		}
	}

	useEffect(() => {
		const timer = setTimeout(() => {
			loadAnchoring();
		}, 0);
		return () => clearTimeout(timer);
	}, []);

	async function createBatch(publishMethod = 'audit_anchor') {
		setIsBusy(true);
		setStatus('Creating and publishing Merkle batch...');
		setError('');
		try {
			const response = await fetch('/api/admin/anchoring/batches', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ publishMethod }),
			});
			const body = await response.json();
			if (!response.ok) throw new Error(body.error || 'Unable to create batch');
			setStatus(body.message || 'Merkle batch created.');
			await loadAnchoring();
		} catch (batchError) {
			setError(batchError.message);
			setStatus('');
		} finally {
			setIsBusy(false);
		}
	}

	async function retryBatch(batchId) {
		setIsBusy(true);
		setStatus('Retrying Merkle batch publishing...');
		setError('');
		try {
			const response = await fetch(`/api/admin/anchoring/batches/${batchId}/retry`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ publishMethod: 'audit_anchor' }),
			});
			const body = await response.json();
			if (!response.ok) throw new Error(body.error || 'Unable to retry batch');
			setStatus('Batch publishing retry complete.');
			await loadAnchoring();
		} catch (retryError) {
			setError(retryError.message);
			setStatus('');
		} finally {
			setIsBusy(false);
		}
	}

	async function verifyBatch(batchId) {
		setIsBusy(true);
		setError('');
		setVerifyResult(null);
		try {
			const response = await fetch(`/api/admin/anchoring/batches/${batchId}/verify`, {
				method: 'POST',
			});
			const body = await response.json();
			if (!response.ok) throw new Error(body.error || 'Unable to verify batch');
			setVerifyResult(body);
		} catch (verifyError) {
			setError(verifyError.message);
		} finally {
			setIsBusy(false);
		}
	}

	return (
		<div className="space-y-6">
			<section className="grid gap-4 sm:grid-cols-3">
				<div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
					<p className="text-sm text-slate-400">Pending anchors</p>
					<p className="mt-2 text-3xl font-bold text-white">{data.pendingAnchorCount}</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
					<p className="text-sm text-slate-400">Failed anchors</p>
					<p className="mt-2 text-3xl font-bold text-white">{data.failedAnchorCount}</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
					<p className="text-sm text-slate-400">Latest batches</p>
					<p className="mt-2 text-3xl font-bold text-white">{data.latestBatches.length}</p>
				</div>
			</section>

			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h2 className="text-xl font-bold text-white">Merkle batch controls</h2>
						<p className="mt-2 text-sm leading-6 text-slate-300">
							Create a batch from pending document hashes and publish only the
							Merkle root and audit anchor commitment.
						</p>
					</div>
					<button
						type="button"
						onClick={() => createBatch('audit_anchor')}
						disabled={isBusy || data.pendingAnchorCount === 0}
						className="rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600 disabled:bg-slate-700">
						Create Anchor Batch
					</button>
				</div>
				{status ? (
					<p className="mt-4 rounded-lg border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
						{status}
					</p>
				) : null}
				{error ? (
					<p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
						{error}
					</p>
				) : null}
				{verifyResult ? (
					<div className="mt-4 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
						<p className="font-bold">Batch proof verification</p>
						<p className="mt-1">
							{verifyResult.validProofCount}/{verifyResult.proofCount} proofs valid ·
							public commitment {verifyResult.publicCommitmentValid ? 'valid' : 'missing'}
						</p>
					</div>
				) : null}
			</section>

			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
				<div className="flex items-end justify-between gap-3">
					<div>
						<p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-300">
							Latest batches
						</p>
						<h2 className="mt-2 text-2xl font-bold text-white">Public commitments</h2>
					</div>
					<p className="text-sm text-slate-400">{data.latestBatches.length} batches</p>
				</div>

				<div className="mt-5 overflow-hidden rounded-xl border border-white/10">
					<table className="w-full min-w-[980px] text-left text-sm">
						<thead className="bg-slate-950/80 text-xs uppercase tracking-[0.18em] text-slate-400">
							<tr>
								<th className="px-4 py-3">Batch</th>
								<th className="px-4 py-3">Size</th>
								<th className="px-4 py-3">Merkle root</th>
								<th className="px-4 py-3">Method</th>
								<th className="px-4 py-3">Status</th>
								<th className="px-4 py-3">Commitment</th>
								<th className="px-4 py-3">Action</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-white/10">
							{data.latestBatches.map((batch) => (
								<tr key={batch.id}>
									<td className="px-4 py-3 font-semibold text-white">{shortValue(batch.id)}</td>
									<td className="px-4 py-3 text-slate-300">{batch.batchSize}</td>
									<td className="px-4 py-3 font-mono text-xs text-slate-300">
										{shortValue(batch.merkleRoot)}
									</td>
									<td className="px-4 py-3 text-slate-300">{batch.publishMethod}</td>
									<td className="px-4 py-3">
										<span className="rounded-full border border-white/10 bg-slate-950/60 px-2 py-1 text-xs font-bold uppercase text-slate-200">
											{batch.status}
										</span>
									</td>
									<td className="px-4 py-3 text-xs text-slate-300">
										{batch.transactionId
											? shortValue(batch.transactionId)
											: batch.anchorCommitmentAvailable
												? 'anchor record'
												: 'none'}
									</td>
									<td className="px-4 py-3">
										<div className="flex gap-2">
											<button
												type="button"
												onClick={() => verifyBatch(batch.id)}
												disabled={isBusy}
												className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-white transition hover:border-red-400 hover:text-red-200">
												Verify
											</button>
											{batch.status === 'failed' ? (
												<button
													type="button"
													onClick={() => retryBatch(batch.id)}
													disabled={isBusy}
													className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-600 disabled:bg-slate-700">
													Retry
												</button>
											) : null}
										</div>
									</td>
								</tr>
							))}
							{data.latestBatches.length === 0 ? (
								<tr>
									<td colSpan={7} className="px-4 py-8 text-center text-slate-400">
										No Merkle batches yet.
									</td>
								</tr>
							) : null}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}

export { AdminAnchoringPanel };
