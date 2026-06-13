'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PortalIcon } from '@/components/PortalIcon';
import { IssuerDocumentSummary } from '@/components/IssuerDocumentSummary';

const quickActions = [
	{
		label: 'Review requests',
		description: 'Check pending owner document requests',
		href: '/issuer/requests',
		icon: 'document',
	},
	{
		label: 'Issue document',
		description: 'Start a new issuance workflow',
		href: '/issuer/issuance',
		icon: 'upload',
	},
	{
		label: 'Manage templates',
		description: 'Edit draft and published templates',
		href: '/issuer/templates',
		icon: 'template',
	},
	{
		label: 'Verification logs coming soon',
		description: 'Verification history and analytics are not available yet',
		icon: 'audit',
		disabled: true,
	},
];

function MetricTile({ icon, label, value, hint, tone = 'slate' }) {
	const tones = {
		red: 'border-red-400/30 bg-red-500/10 text-red-200',
		amber: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
		emerald: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100',
		slate: 'border-white/10 bg-white/4 text-slate-200',
	};

	return (
		<div className="rounded-2xl border border-white/10 bg-white/4 p-5">
			<div
				className={`grid h-10 w-10 place-items-center rounded-xl border ${tones[tone]}`}>
				<PortalIcon name={icon} className="h-5 w-5" />
			</div>
			<p className="mt-4 text-sm text-slate-400">{label}</p>
			<p className="mt-1 text-3xl font-bold text-white">{value}</p>
			{hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
		</div>
	);
}

export function IssuerDashboard() {
	const [data, setData] = useState(null);
	const [error, setError] = useState('');
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let ignore = false;

		async function loadDashboard() {
			setIsLoading(true);
			setError('');
			try {
				const response = await fetch('/api/issuer/dashboard');
				const body = await response.json();
				if (!response.ok) throw new Error(body.error || 'Unable to load dashboard');
				if (!ignore) setData(body);
			} catch (loadError) {
				if (!ignore) {
					setError(
						loadError instanceof Error
							? loadError.message
							: 'Unable to load dashboard',
					);
				}
			} finally {
				if (!ignore) setIsLoading(false);
			}
		}

		loadDashboard();
		return () => {
			ignore = true;
		};
	}, []);

	const metrics = data?.metrics;
	const pendingRequestsComingSoon = !metrics?.pendingRequestsAvailable;
	const verificationAnalyticsComingSoon = !metrics?.verificationAnalyticsAvailable;
	const templatesEmpty = !isLoading && (metrics?.activeTemplates ?? 0) === 0;

	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/4 p-8 shadow-[0_0_80px_rgba(15,23,42,0.45)]">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
					<div className="max-w-3xl">
						<p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-400">
							Issuer dashboard
						</p>
						<h1 className="mt-4 text-4xl font-bold tracking-tight text-white">
							{data?.issuer?.name || 'Issuer portal'}
						</h1>
						<p className="mt-4 text-lg leading-8 text-slate-300">
							Monitor issuance, templates, verification activity, and anchor
							status for your tenant in one place.
						</p>
					</div>
					<Link
						href="/issuer/issuance"
						className="inline-flex rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
						Issue document
					</Link>
				</div>
			</section>

			{error ? (
				<p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">
					{error}
				</p>
			) : null}

			<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
				<MetricTile
					icon="document"
					label="Pending requests"
					value={
						isLoading
							? '—'
							: pendingRequestsComingSoon
								? '—'
								: (metrics?.pendingRequests ?? 0)
					}
					hint={
						pendingRequestsComingSoon
							? 'Request workflow coming soon'
							: 'Awaiting issuer review'
					}
					tone="amber"
				/>
				<MetricTile
					icon="check"
					label="Documents issued"
					value={isLoading ? '—' : (metrics?.documentsIssued ?? 0)}
					hint={`${metrics?.validDocuments ?? 0} valid`}
					tone="emerald"
				/>
				<MetricTile
					icon="scanner"
					label="Verification scans"
					value={
						isLoading
							? '—'
							: verificationAnalyticsComingSoon
								? '—'
								: (metrics?.verificationScans ?? 0)
					}
					hint={
						verificationAnalyticsComingSoon
							? 'Verification analytics coming soon'
							: 'QR and verify endpoint activity'
					}
					tone="red"
				/>
				<div className="rounded-2xl border border-white/10 bg-white/4 p-5">
					<div className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/4 text-slate-200">
						<PortalIcon name="template" className="h-5 w-5" />
					</div>
					<p className="mt-4 text-sm text-slate-400">Active templates</p>
					<p className="mt-1 text-3xl font-bold text-white">
						{isLoading ? '—' : (metrics?.activeTemplates ?? 0)}
					</p>
					{templatesEmpty ? (
						<p className="mt-2 text-xs text-slate-500">
							No templates yet.{' '}
							<Link
								href="/issuer/templates"
								className="font-semibold text-red-300 transition hover:text-red-200">
								Manage templates
							</Link>
						</p>
					) : (
						<p className="mt-2 text-xs text-slate-500">
							{metrics?.publishedTemplates ?? 0} published
						</p>
					)}
				</div>
				<MetricTile
					icon="upload"
					label="Pending anchor"
					value={isLoading ? '—' : (metrics?.pendingAnchor ?? 0)}
					hint="Documents awaiting anchor publish"
					tone="amber"
				/>
				<MetricTile
					icon="shield"
					label="Tenant"
					value={data?.issuer?.tenantId ? 'Active' : '—'}
					hint={data?.issuer?.tenantId || 'Tenant scope'}
				/>
			</section>

			<section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
				<div className="rounded-2xl border border-white/10 bg-white/4 p-6">
					<p className="text-sm font-semibold uppercase tracking-[0.28em] text-red-300">
						Quick actions
					</p>
					<div className="mt-5 grid gap-3 sm:grid-cols-2">
						{quickActions.map((action) => {
							const content = (
								<div className="flex items-start gap-3">
									<div
										className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${
											action.disabled
												? 'border-white/10 bg-slate-950/40 text-slate-500'
												: 'border-red-400/30 bg-red-500/10 text-red-200'
										}`}>
										<PortalIcon name={action.icon} className="h-5 w-5" />
									</div>
									<div>
										<p
											className={`text-sm font-bold ${
												action.disabled ? 'text-slate-400' : 'text-white'
											}`}>
											{action.label}
										</p>
										<p className="mt-1 text-xs leading-5 text-slate-400">
											{action.description}
										</p>
									</div>
								</div>
							);

							if (action.disabled) {
								return (
									<div
										key={action.label}
										aria-disabled="true"
										className="cursor-not-allowed rounded-xl border border-white/10 bg-slate-950/30 p-4 opacity-70">
										{content}
									</div>
								);
							}

							return (
								<Link
									key={action.label}
									href={action.href}
									className="rounded-xl border border-white/10 bg-slate-950/50 p-4 transition hover:border-red-400">
									{content}
								</Link>
							);
						})}
					</div>
				</div>

				<div className="rounded-2xl border border-white/10 bg-white/4 p-6">
					<p className="text-sm font-semibold uppercase tracking-[0.28em] text-red-300">
						Recent activity
					</p>
					<div className="mt-5 space-y-3">
						{isLoading ? (
							<p className="text-sm text-slate-400">Loading activity...</p>
						) : null}
						{!isLoading && data?.recentActivity?.length === 0 ? (
							<p className="text-sm text-slate-400">
								No recent tenant activity yet. Issue a document or publish a
								template to populate this feed.
							</p>
						) : null}
						{data?.recentActivity?.map((item, index) => (
							<div
								key={`${item.kind || 'activity'}-${item.id || index}`}
								className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3">
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="text-sm font-semibold text-white">
											{item.action}
										</p>
										<p className="mt-1 text-xs text-slate-400">{item.target}</p>
									</div>
									<span className="shrink-0 text-xs text-slate-500">
										{item.label}
									</span>
								</div>
							</div>
						))}
					</div>
				</div>
			</section>

			<IssuerDocumentSummary initialPayload={data?.documentsPayload ?? null} />
		</div>
	);
}
