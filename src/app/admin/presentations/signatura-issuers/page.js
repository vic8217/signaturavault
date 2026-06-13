'use client';

import { useEffect, useMemo, useState } from 'react';

function defaultExpirationValue() {
	const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
	date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
	return date.toISOString().slice(0, 16);
}

function formatDate(value) {
	if (!value) return 'Not set';
	return new Intl.DateTimeFormat('en', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(value));
}

async function readJson(response) {
	const text = await response.text();
	if (!text) return {};
	try {
		return JSON.parse(text);
	} catch {
		return { error: text };
	}
}

export default function AdminPresentationAccessPage() {
	const [links, setLinks] = useState([]);
	const [latestUrl, setLatestUrl] = useState('');
	const [copied, setCopied] = useState(false);
	const [copiedLinkId, setCopiedLinkId] = useState('');
	const [status, setStatus] = useState('Loading access links...');
	const [error, setError] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [expiresAt, setExpiresAt] = useState(defaultExpirationValue);

	const activeLinks = useMemo(
		() =>
			links.filter((link) => {
				const expired = new Date(link.expiresAt) <= new Date();
				return !link.isRevoked && !expired;
			}),
		[links],
	);

	async function loadLinks() {
		try {
			const response = await fetch(
				'/api/admin/presentations/signatura-issuers/access-links',
			);
			const data = await readJson(response);
			if (!response.ok) throw new Error(data.error || 'Unable to load links');
			setLinks(data.links || []);
			setStatus('');
			setError('');
		} catch (loadError) {
			setError(loadError.message);
			setStatus('');
		}
	}

	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect
		loadLinks();
	}, []);

	async function copyLatestUrl(url = latestUrl) {
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1600);
		} catch {
			setCopied(false);
		}
	}

	async function copyShareUrl(link) {
		if (!link.shareUrl) return;
		try {
			await navigator.clipboard.writeText(link.shareUrl);
			setCopiedLinkId(link.id);
			window.setTimeout(() => setCopiedLinkId(''), 1600);
		} catch {
			setCopiedLinkId('');
		}
	}

	async function createLink(event) {
		event.preventDefault();
		setIsSubmitting(true);
		setError('');
		setLatestUrl('');
		const formData = new FormData(event.currentTarget);
		const payload = {
			viewerName: formData.get('viewerName'),
			viewerEmail: formData.get('viewerEmail'),
			expiresAt: new Date(expiresAt).toISOString(),
			maxViews: formData.get('maxViews'),
		};

		try {
			const response = await fetch(
				'/api/admin/presentations/signatura-issuers/access-links',
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				},
			);
			const data = await readJson(response);
			if (!response.ok) throw new Error(data.error || 'Unable to create link');
			setLatestUrl(data.url);
			setLinks((current) => [{ ...data.link, shareUrl: data.url }, ...current]);
			event.currentTarget.reset();
			setExpiresAt(defaultExpirationValue());
		} catch (submitError) {
			setError(submitError.message);
		} finally {
			setIsSubmitting(false);
		}
	}

	async function revokeLink(id) {
		setError('');
		try {
			const response = await fetch(
				`/api/admin/presentations/signatura-issuers/access-links/${id}`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'revoke' }),
				},
			);
			const data = await readJson(response);
			if (!response.ok) throw new Error(data.error || 'Unable to revoke link');
			setLinks((current) =>
				current.map((link) => (link.id === id ? data.link : link)),
			);
		} catch (revokeError) {
			setError(revokeError.message);
		}
	}

	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/4 p-8">
				<p className="text-sm font-bold uppercase tracking-[0.22em] text-red-300">
					Boardroom deck access
				</p>
				<h1 className="mt-3 text-3xl font-black text-white">
					Signatura Issuers Presentation
				</h1>
				<p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
					Generate expiring viewer links for the 15-slide issuer deck. Tokens
					are shown only once and stored as hashes.
				</p>
			</section>

			<section className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
				<form
					onSubmit={createLink}
					className="rounded-2xl border border-white/10 bg-slate-950/70 p-6">
					<h2 className="text-xl font-bold text-white">Generate access link</h2>
					<div className="mt-5 grid gap-4">
						<label className="grid gap-2 text-sm font-semibold text-slate-100">
							Viewer name
							<input
								name="viewerName"
								type="text"
								placeholder="Optional"
								className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
							/>
						</label>
						<label className="grid gap-2 text-sm font-semibold text-slate-100">
							Viewer email
							<input
								name="viewerEmail"
								type="email"
								placeholder="Optional"
								className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
							/>
						</label>
						<label className="grid gap-2 text-sm font-semibold text-slate-100">
							Expiration
							<input
								name="expiresAt"
								type="datetime-local"
								required
								value={expiresAt}
								onChange={(event) => setExpiresAt(event.target.value)}
								className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
							/>
						</label>
						<label className="grid gap-2 text-sm font-semibold text-slate-100">
							Max views
							<input
								name="maxViews"
								type="number"
								min="1"
								placeholder="Unlimited"
								className="rounded-xl border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none ring-red-500 transition focus:ring-2"
							/>
						</label>
						<button
							type="submit"
							disabled={isSubmitting}
							className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-slate-700">
							{isSubmitting ? 'Generating...' : 'Generate access token'}
						</button>
					</div>
				</form>

				<div className="rounded-2xl border border-white/10 bg-slate-950/70 p-6">
					<h2 className="text-xl font-bold text-white">Generated link</h2>
					{latestUrl ? (
						<div className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
							<p className="break-all text-sm text-emerald-50">{latestUrl}</p>
							<button
								type="button"
								onClick={() => copyLatestUrl()}
								className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-400">
								{copied ? 'Copied' : 'Copy link'}
							</button>
						</div>
					) : (
						<p className="mt-5 text-sm text-slate-400">
							The secure URL appears here once after generation.
						</p>
					)}
					<div className="mt-6 grid grid-cols-3 gap-3">
						<div className="rounded-xl border border-white/10 bg-white/4 p-4">
							<p className="text-2xl font-black text-white">{links.length}</p>
							<p className="text-xs uppercase tracking-[0.16em] text-slate-400">
								Total
							</p>
						</div>
						<div className="rounded-xl border border-white/10 bg-white/4 p-4">
							<p className="text-2xl font-black text-white">{activeLinks.length}</p>
							<p className="text-xs uppercase tracking-[0.16em] text-slate-400">
								Active
							</p>
						</div>
						<div className="rounded-xl border border-white/10 bg-white/4 p-4">
							<p className="text-2xl font-black text-white">
								{links.reduce((sum, link) => sum + link.viewCount, 0)}
							</p>
							<p className="text-xs uppercase tracking-[0.16em] text-slate-400">
								Views
							</p>
						</div>
					</div>
				</div>
			</section>

			{status ? (
				<div className="rounded-xl border border-white/10 bg-white/4 p-4 text-sm text-slate-300">
					{status}
				</div>
			) : null}
			{error ? (
				<div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
					{error}
				</div>
			) : null}

			<section className="rounded-2xl border border-white/10 bg-slate-950/70 p-6">
				<h2 className="text-xl font-bold text-white">Access links</h2>
				<div className="mt-5 overflow-x-auto">
					<table className="w-full min-w-[760px] text-left text-sm">
						<thead className="text-xs uppercase tracking-[0.16em] text-slate-400">
							<tr>
								<th className="border-b border-white/10 px-3 py-3">Viewer</th>
								<th className="border-b border-white/10 px-3 py-3">Token</th>
								<th className="border-b border-white/10 px-3 py-3">Expires</th>
								<th className="border-b border-white/10 px-3 py-3">Views</th>
								<th className="border-b border-white/10 px-3 py-3">Status</th>
								<th className="border-b border-white/10 px-3 py-3">Action</th>
							</tr>
						</thead>
						<tbody className="text-slate-200">
							{links.map((link) => {
								const expired = new Date(link.expiresAt) <= new Date();
								const exhausted =
									link.maxViews !== null && link.viewCount >= link.maxViews;
								const statusLabel = link.isRevoked
									? 'Revoked'
									: expired
										? 'Expired'
										: exhausted
											? 'Maxed'
											: 'Active';
								return (
									<tr key={link.id} className="border-b border-white/5">
										<td className="px-3 py-4">
											<p className="font-semibold text-white">
												{link.viewerName || 'Unnamed viewer'}
											</p>
											<p className="text-xs text-slate-500">
												{link.viewerEmail || 'No email'}
											</p>
										</td>
										<td className="px-3 py-4 font-mono text-xs">
											{link.tokenPrefix}...
										</td>
										<td className="px-3 py-4">{formatDate(link.expiresAt)}</td>
										<td className="px-3 py-4">
											{link.viewCount}
											{link.maxViews ? ` / ${link.maxViews}` : ''}
										</td>
										<td className="px-3 py-4">{statusLabel}</td>
										<td className="px-3 py-4">
											<div className="flex flex-wrap gap-2">
												<button
													type="button"
													onClick={() => copyShareUrl(link)}
													disabled={!link.shareUrl}
													title={
														link.shareUrl
															? 'Copy presentation link'
															: 'Share URL unavailable for older links. Generate a new access link.'
													}
													className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-red-100 transition hover:border-red-300 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
													{copiedLinkId === link.id
														? 'Copied'
														: link.shareUrl
															? 'Share link'
															: 'Unavailable'}
												</button>
											<button
												type="button"
												onClick={() => revokeLink(link.id)}
												disabled={link.isRevoked}
												className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-bold text-red-100 transition hover:border-red-300 disabled:cursor-not-allowed disabled:opacity-40">
												Revoke
											</button>
											</div>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}
