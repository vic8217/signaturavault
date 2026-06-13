'use client';

import { useState } from 'react';
import { PortalIcon } from '@/components/PortalIcon';

function formatDate(value) {
	if (!value) return 'Not published';
	return new Intl.DateTimeFormat('en', {
		year: 'numeric',
		month: 'short',
		day: '2-digit',
	}).format(new Date(value));
}

export function WalletIssuerDocuments({ issuer, templates }) {
	const [keptTemplates, setKeptTemplates] = useState(new Set());
	const [message, setMessage] = useState('');

	function keepTemplate(template) {
		setKeptTemplates((current) => new Set([...current, template.id]));
		setMessage(`${template.name} was added to your wallet queue.`);
	}

	function startApplication(template) {
		setMessage(`${template.name} is ready for online application.`);
	}

	return (
		<div className="space-y-6">
			<section className="rounded-2xl border border-white/10 bg-white/4 p-6 shadow-[0_0_70px_rgba(15,23,42,0.42)]">
				<p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-400">
					Issuer Documents
				</p>
				<h1 className="mt-3 text-3xl font-bold text-white">{issuer.name}</h1>
				<p className="mt-4 text-sm leading-6 text-slate-300">
					Review documents this issuer has made available for online application
					and digitized wallet storage.
				</p>
				<div className="mt-5 flex flex-wrap gap-2">
					<span className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs font-bold text-slate-300">
						{issuer.type || 'Issuer'}
					</span>
					<span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-200">
						{issuer.status || 'active'}
					</span>
				</div>
			</section>

			{message ? (
				<p className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
					{message}
				</p>
			) : null}

			<section className="grid gap-4 sm:grid-cols-2">
				<div className="rounded-2xl border border-white/10 bg-white/4 p-5">
					<div className="mb-4 grid h-10 w-10 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
						<PortalIcon name="document" className="h-5 w-5" />
					</div>
					<p className="text-sm text-slate-300">Available documents</p>
					<p className="mt-2 text-3xl font-bold text-white">{templates.length}</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-white/4 p-5">
					<div className="mb-4 grid h-10 w-10 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
						<PortalIcon name="shield" className="h-5 w-5" />
					</div>
					<p className="text-sm text-slate-300">Kept in wallet queue</p>
					<p className="mt-2 text-3xl font-bold text-white">{keptTemplates.size}</p>
				</div>
			</section>

			<section className="space-y-4">
				<div className="flex items-center justify-between gap-3 px-1">
					<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
						Online applications and digitized documents
					</p>
					<p className="text-sm text-slate-400">
						{templates.length} item{templates.length === 1 ? '' : 's'}
					</p>
				</div>

				{templates.map((template) => {
					const isKept = keptTemplates.has(template.id);
					return (
						<article
							key={template.id}
							className="rounded-2xl border border-white/10 bg-white/4 p-5">
							<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
								<div className="flex gap-4">
									<div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
										<PortalIcon name="template" className="h-6 w-6" />
									</div>
									<div>
										<h2 className="text-lg font-bold text-white">{template.name}</h2>
										<p className="mt-1 text-sm text-slate-400">
											{template.documentType || 'Digitized document'} · v
											{template.version}
										</p>
										<p className="mt-3 text-sm leading-6 text-slate-300">
											Published {formatDate(template.publishedAt || template.updatedAt)}.
											This template can be used for online application workflows
											and wallet-ready digital records.
										</p>
										<p className="mt-2 text-xs text-slate-500">
											{template.fieldCount} captured field
											{template.fieldCount === 1 ? '' : 's'}
										</p>
									</div>
								</div>
								<div className="flex shrink-0 flex-wrap gap-2">
									<button
										type="button"
										onClick={() => startApplication(template)}
										className="rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600">
										Online application
									</button>
									<button
										type="button"
										onClick={() => keepTemplate(template)}
										disabled={isKept}
										className="rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-white transition hover:border-red-400 hover:text-red-200 disabled:text-slate-500">
										{isKept ? 'Kept in wallet' : 'Keep in wallet'}
									</button>
								</div>
							</div>
						</article>
					);
				})}

				{templates.length === 0 ? (
					<article className="rounded-2xl border border-white/10 bg-white/4 p-5">
						<div className="flex gap-4">
							<div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
								<PortalIcon name="document" className="h-5 w-5" />
							</div>
							<div>
								<h2 className="font-bold text-white">
									No online documents available yet
								</h2>
								<p className="mt-2 text-sm leading-6 text-slate-300">
									Published templates from this issuer will appear here once
									they are ready for application or wallet storage.
								</p>
							</div>
						</div>
					</article>
				) : null}
			</section>
		</div>
	);
}
