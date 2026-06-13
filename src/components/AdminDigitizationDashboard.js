'use client';

import { useEffect, useMemo, useState } from 'react';
import { PortalIcon } from '@/components/PortalIcon';
import { TemplateCaptureDashboard } from '@/components/TemplateCaptureDashboard';

function issuerKey(template) {
	return template.issuer_id || template.tenant_id || 'unknown';
}

function shortValue(value) {
	if (!value) return 'None';
	if (value.length <= 18) return value;
	return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function formatDate(value) {
	if (!value) return 'No date';
	return new Intl.DateTimeFormat('en', {
		year: 'numeric',
		month: 'short',
		day: '2-digit',
	}).format(new Date(value));
}

function buildIssuerRows(templates) {
	const issuers = new Map();

	for (const template of templates) {
		const key = issuerKey(template);
		const current =
			issuers.get(key) ||
			{
				id: key,
				name: template.issuer_name || 'Unknown issuer',
				type: template.issuer_type || 'Issuer',
				tenantId: template.tenant_id,
				total: 0,
				drafts: 0,
				notPublished: 0,
				published: 0,
				archived: 0,
				latestUpdatedAt: template.updated_at,
			};

		current.total += 1;
		if (template.status === 'draft') current.drafts += 1;
		if (template.status === 'published') current.published += 1;
		if (template.status === 'archived') current.archived += 1;
		if (template.status !== 'published') current.notPublished += 1;
		if (new Date(template.updated_at || 0) > new Date(current.latestUpdatedAt || 0)) {
			current.latestUpdatedAt = template.updated_at;
		}

		issuers.set(key, current);
	}

	return Array.from(issuers.values()).sort(
		(a, b) => b.notPublished - a.notPublished || a.name.localeCompare(b.name),
	);
}

function StatusPill({ value, tone = 'slate' }) {
	const styles = {
		amber: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
		emerald: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
		red: 'border-red-400/30 bg-red-400/10 text-red-100',
		slate: 'border-white/10 bg-slate-950/60 text-slate-200',
	};

	return (
		<span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${styles[tone]}`}>
			{value}
		</span>
	);
}

export function AdminDigitizationDashboard() {
	const [templates, setTemplates] = useState([]);
	const [status, setStatus] = useState('Loading digitization queue...');
	const [error, setError] = useState('');
	const [workspace, setWorkspace] = useState(null);

	async function loadTemplates() {
		setError('');
		try {
			const response = await fetch('/api/admin/templates');
			const body = await response.json();
			if (!response.ok) {
				throw new Error(body.error || 'Unable to load digitization queue');
			}
			setTemplates(body.templates || []);
			setStatus('');
		} catch (loadError) {
			setError(loadError.message);
			setStatus('');
		}
	}

	useEffect(() => {
		const timer = setTimeout(() => {
			loadTemplates();
		}, 0);
		return () => clearTimeout(timer);
	}, []);

	const issuerRows = useMemo(() => buildIssuerRows(templates), [templates]);
	const publishedTemplates = useMemo(
		() => templates.filter((template) => template.status === 'published'),
		[templates],
	);
	const notPublishedCount = templates.filter(
		(template) => template.status !== 'published',
	).length;
	const draftCount = templates.filter((template) => template.status === 'draft').length;

	if (workspace) {
		const query = new URLSearchParams();
		if (workspace.issuerId) query.set('issuerId', workspace.issuerId);
		if (workspace.status) query.set('status', workspace.status);
		const listPath = `/api/admin/templates?${query.toString()}`;
		const isPublishedView = workspace.status === 'published';

		return (
			<div className="space-y-6">
				<button
					type="button"
					onClick={() => {
						setWorkspace(null);
						loadTemplates();
					}}
					className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-white transition hover:border-red-400 hover:text-red-200">
					Back to digitization queue
				</button>
				<TemplateCaptureDashboard
					key={`${workspace.issuerId || 'all'}-${workspace.status}`}
					apiBase="/api/admin/templates"
					listPath={listPath}
					title={workspace.title}
					kicker={isPublishedView ? 'Published templates' : 'Digitization support'}
					description={workspace.description}
					showUpload={false}
					canPublish={false}
					canArchive={false}
					assistanceMode={!isPublishedView}
				/>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/4 p-10 shadow-[0_0_80px_rgba(15,23,42,0.45)]">
				<p className="text-sm font-bold uppercase tracking-[0.3em] text-red-400">
					Digitization Support
				</p>
				<div className="mt-4 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
					<div>
						<h1 className="text-3xl font-bold text-white">
							Issuer digitization queue
						</h1>
						<p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
							See which issuers have drafts needing assistance, then open their
							templates for OCR and field placement support. Published templates
							remain available for review.
						</p>
					</div>
					<button
						type="button"
						onClick={() =>
							setWorkspace({
								status: 'published',
								title: 'All published digitized templates',
								description:
									'Review all published document templates across issuers. Published templates are read-only from Dev Admin support.',
							})
						}
						disabled={publishedTemplates.length === 0}
						className="rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600 disabled:bg-slate-700 disabled:text-slate-400">
						View all published
					</button>
				</div>
			</section>

			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{[
					['bank', 'Issuers with templates', issuerRows.length],
					['template', 'Not yet published', notPublishedCount],
					['document', 'Drafts to assist', draftCount],
					['shield', 'Published templates', publishedTemplates.length],
				].map(([icon, label, value]) => (
					<div
						key={label}
						className="rounded-xl border border-white/10 bg-white/4 p-5">
						<div className="mb-4 grid h-10 w-10 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
							<PortalIcon name={icon} className="h-5 w-5" />
						</div>
						<p className="text-sm text-slate-300">{label}</p>
						<p className="mt-2 text-3xl font-bold text-white">{value}</p>
					</div>
				))}
			</div>

			{status ? (
				<div className="rounded-2xl border border-white/10 bg-white/4 p-5 text-sm text-slate-300">
					{status}
				</div>
			) : null}
			{error ? (
				<div className="rounded-2xl border border-red-400/30 bg-red-400/10 p-5 text-sm text-red-100">
					{error}
				</div>
			) : null}

			<section className="rounded-2xl border border-white/10 bg-white/4 p-6">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="text-sm font-bold uppercase tracking-[0.2em] text-red-300">
							Issuer queue
						</p>
						<h2 className="mt-2 text-2xl font-bold text-white">
							Templates by issuer
						</h2>
					</div>
					<p className="text-sm text-slate-400">
						{issuerRows.length} issuer{issuerRows.length === 1 ? '' : 's'}
					</p>
				</div>

				<div className="mt-6 overflow-hidden rounded-xl border border-white/10">
					<div className="grid grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_0.9fr_1.2fr] gap-4 bg-slate-950/80 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
						<span>Issuer</span>
						<span>Not yet</span>
						<span>Draft</span>
						<span>Published</span>
						<span>Latest update</span>
						<span>Action</span>
					</div>
					<div className="divide-y divide-white/10">
						{issuerRows.map((issuer) => (
							<article
								key={issuer.id}
								className="grid gap-4 px-4 py-4 text-sm text-slate-200 md:grid-cols-[1.4fr_0.7fr_0.7fr_0.7fr_0.9fr_1.2fr]">
								<div>
									<p className="font-bold text-white">{issuer.name}</p>
									<p className="mt-1 text-xs text-slate-400">{issuer.type}</p>
									<p className="mt-1 font-mono text-xs text-slate-500">
										{shortValue(issuer.tenantId)}
									</p>
								</div>
								<div>
									<StatusPill value={issuer.notPublished} tone="amber" />
								</div>
								<div>
									<StatusPill value={issuer.drafts} tone="amber" />
								</div>
								<div>
									<StatusPill value={issuer.published} tone="emerald" />
								</div>
								<div className="text-slate-300">
									{formatDate(issuer.latestUpdatedAt)}
								</div>
								<div className="flex flex-wrap gap-2">
									<button
										type="button"
										onClick={() =>
											setWorkspace({
												issuerId: issuer.id,
												status: 'not_published',
												title: `${issuer.name} digitization drafts`,
												description:
													'Assist this issuer with OCR, field review, and layout alignment. Final publishing stays with issuer staff.',
											})
										}
										disabled={issuer.notPublished === 0}
										className="rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-600 disabled:bg-slate-700 disabled:text-slate-400">
										View and assist
									</button>
									<button
										type="button"
										onClick={() =>
											setWorkspace({
												issuerId: issuer.id,
												status: 'published',
												title: `${issuer.name} published templates`,
												description:
													'Review published digitized templates for this issuer. Published templates are read-only from Dev Admin support.',
											})
										}
										disabled={issuer.published === 0}
										className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white transition hover:border-red-400 hover:text-red-200 disabled:text-slate-500">
										View published
									</button>
								</div>
							</article>
						))}
						{issuerRows.length === 0 && !status ? (
							<p className="px-4 py-10 text-center text-sm text-slate-400">
								No issuer templates have been uploaded yet.
							</p>
						) : null}
					</div>
				</div>
			</section>

			<section className="rounded-2xl border border-white/10 bg-white/4 p-6">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="text-sm font-bold uppercase tracking-[0.2em] text-red-300">
							Published library
						</p>
						<h2 className="mt-2 text-2xl font-bold text-white">
							All published documents/templates
						</h2>
					</div>
					<p className="text-sm text-slate-400">
						{publishedTemplates.length} published
					</p>
				</div>

				<div className="mt-6 overflow-hidden rounded-xl border border-white/10">
					<div className="grid grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr] gap-4 bg-slate-950/80 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
						<span>Template</span>
						<span>Issuer</span>
						<span>Type</span>
						<span>Published</span>
						<span>Action</span>
					</div>
					<div className="divide-y divide-white/10">
						{publishedTemplates.slice(0, 10).map((template) => (
							<article
								key={template.id}
								className="grid gap-4 px-4 py-4 text-sm text-slate-200 md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr]">
								<div>
									<p className="font-bold text-white">{template.name}</p>
									<p className="mt-1 text-xs text-slate-500">v{template.version}</p>
								</div>
								<p>{template.issuer_name || 'Unknown issuer'}</p>
								<p>{template.document_type || 'Unclassified'}</p>
								<p>{formatDate(template.published_at || template.updated_at)}</p>
								<button
									type="button"
									onClick={() =>
										setWorkspace({
											issuerId: issuerKey(template),
											status: 'published',
											title: `${template.issuer_name || 'Issuer'} published templates`,
											description:
												'Review published digitized templates. Published templates are read-only from Dev Admin support.',
										})
									}
									className="w-fit rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-white transition hover:border-red-400 hover:text-red-200">
									View
								</button>
							</article>
						))}
						{publishedTemplates.length === 0 && !status ? (
							<p className="px-4 py-10 text-center text-sm text-slate-400">
								No published templates yet.
							</p>
						) : null}
					</div>
				</div>
			</section>
		</div>
	);
}
