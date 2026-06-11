'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { extractTokenFromInput } from '@/lib/verify-token';

function formatTimestamp(value) {
	if (!value) return '—';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '—';
	return date.toLocaleString();
}

function statusTone(status) {
	const normalized = String(status || '').toLowerCase();
	if (normalized === 'valid' || normalized === 'active') {
		return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100';
	}
	if (normalized === 'revoked' || normalized === 'invalid') {
		return 'border-red-400/30 bg-red-400/10 text-red-100';
	}
	return 'border-slate-400/30 bg-slate-400/10 text-slate-200';
}

function VerifyDocumentPanel() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [tokenInput, setTokenInput] = useState('');
	const [result, setResult] = useState(null);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const lastVerifiedTokenRef = useRef('');

	const verifyToken = useCallback(async (rawToken, { syncUrl = true } = {}) => {
		const token = extractTokenFromInput(rawToken);
		if (!token) {
			setError('Enter a verification token or paste a Signatura verify link.');
			setResult(null);
			return;
		}

		setLoading(true);
		setError('');
		setResult(null);

		try {
			const response = await fetch(`/api/verify/${encodeURIComponent(token)}`);
			const data = await response.json().catch(() => ({}));

			if (!response.ok) {
				throw new Error(data.error || 'Unable to verify token');
			}

			setResult(data);
			lastVerifiedTokenRef.current = token;
			if (syncUrl) {
				router.replace(`/verify?token=${encodeURIComponent(token)}`, {
					scroll: false,
				});
			}
		} catch (verifyError) {
			setResult(null);
			setError(
				verifyError instanceof Error
					? verifyError.message
					: 'Unable to verify token',
			);
		} finally {
			setLoading(false);
		}
	}, [router]);

	useEffect(() => {
		const queryToken = String(searchParams.get('token') || '').trim();
		if (!queryToken || queryToken === lastVerifiedTokenRef.current) return;
		setTokenInput(queryToken);
		verifyToken(queryToken, { syncUrl: false });
	}, [searchParams, verifyToken]);

	function handleSubmit(event) {
		event.preventDefault();
		verifyToken(tokenInput);
	}

	return (
		<div className="min-h-screen bg-linear-to-b from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-center px-6 py-10">
			<div className="w-full max-w-lg">
				<div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-8">
					<div className="text-center">
						<div className="text-6xl mb-6">🔍</div>
						<h1 className="text-3xl font-bold mb-4">Verify Document</h1>
						<p className="text-slate-300 mb-8">
							Scan a QR code from any Signatura-issued document or paste a
							verification token to check authenticity and revocation status.
						</p>
					</div>

					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="rounded-xl border border-slate-600 bg-slate-900 p-6">
							<p className="text-sm text-slate-400 mb-3">
								Paste a verification token or Signatura verify link:
							</p>
							<input
								type="text"
								value={tokenInput}
								onChange={(event) => setTokenInput(event.target.value)}
								placeholder="VER-… or https://…/verify?token=…"
								className="w-full rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
							/>
						</div>

						<button
							type="submit"
							disabled={loading}
							className="w-full rounded-lg bg-red-500 px-4 py-2 font-semibold text-white transition hover:bg-red-600 disabled:bg-slate-600">
							{loading ? 'Verifying…' : 'Verify Document'}
						</button>
					</form>

					{error ? (
						<p className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
							{error}
						</p>
					) : null}

					{result ? (
						<div className="mt-6 space-y-4 rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-5 text-left">
							<div className="flex flex-wrap items-center gap-3">
								<p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-200">
									Verification result
								</p>
								<span
									className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusTone(result.document_status)}`}>
									{result.document_status || 'unknown'}
								</span>
							</div>

							<dl className="grid gap-3 text-sm text-slate-200">
								<div>
									<dt className="text-xs uppercase tracking-wide text-slate-500">
										Token valid
									</dt>
									<dd>{result.token_valid ? 'Yes' : 'No'}</dd>
								</div>
								<div>
									<dt className="text-xs uppercase tracking-wide text-slate-500">
										Document hash match
									</dt>
									<dd>{result.document_hash_match ? 'Yes' : 'No'}</dd>
								</div>
								<div>
									<dt className="text-xs uppercase tracking-wide text-slate-500">
										Anchor status
									</dt>
									<dd className="capitalize">{result.anchor_status || '—'}</dd>
								</div>
								<div>
									<dt className="text-xs uppercase tracking-wide text-slate-500">
										Issued at
									</dt>
									<dd>{formatTimestamp(result.issued_at)}</dd>
								</div>
								<div>
									<dt className="text-xs uppercase tracking-wide text-slate-500">
										Document ID
									</dt>
									<dd className="break-all font-mono text-xs">
										{result.document_id || '—'}
									</dd>
								</div>
								<div>
									<dt className="text-xs uppercase tracking-wide text-slate-500">
										Private fields
									</dt>
									<dd>
										{result.private_data_redacted
											? 'Redacted for public verification'
											: '—'}
									</dd>
								</div>
								<div>
									<dt className="text-xs uppercase tracking-wide text-slate-500">
										Merkle proof
									</dt>
									<dd>
										{result.merkle_proof_available ? 'Available' : 'Not available'}
									</dd>
								</div>
							</dl>
						</div>
					) : null}

					<div className="mt-8 rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-left text-sm">
						<p className="mb-2 font-semibold text-slate-300">
							What happens when you verify:
						</p>
						<ul className="space-y-2 text-xs text-slate-400">
							<li>Document authenticity is checked against issuer records</li>
							<li>Revocation status is confirmed</li>
							<li>Audit anchor and Merkle proof are validated when available</li>
							<li>Recipient and external identifiers stay redacted</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
	);
}

export { VerifyDocumentPanel };
