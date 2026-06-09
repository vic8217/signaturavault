import Image from 'next/image';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireIssuerContext, templateToApi } from '@/lib/issuer-templates';
import { PortalIcon } from '@/components/PortalIcon';

const sampleFields = [
	'Given Name',
	'Middle Name',
	'Surname',
	'SSS Number',
	'Photo',
];

async function getTemplates() {
	const context = await requireIssuerContext();
	if (context.error) return { templates: [], unavailable: true };

	const templates = await prisma.documentTemplate.findMany({
		where: {
			tenantId: context.tenantId,
			...(context.issuerId ? { issuerId: context.issuerId } : {}),
		},
		include: {
			templateFields: { orderBy: { sortOrder: 'asc' } },
			extractionLogs: { orderBy: { createdAt: 'desc' }, take: 1 },
		},
		orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
	});

	return { templates: templates.map(templateToApi), unavailable: false };
}

function statusClass(status) {
	if (status === 'published') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
	if (status === 'archived') return 'border-slate-400/20 bg-slate-400/10 text-slate-300';
	return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
}

function fieldBoxStyle(field) {
	return {
		left: `${Math.max(0, Math.min(96, Number(field.x_position || 0)))}%`,
		top: `${Math.max(0, Math.min(96, Number(field.y_position || 0)))}%`,
		width: `${Math.max(8, Math.min(96, Number(field.width || 22)))}%`,
		height: `${Math.max(5, Math.min(96, Number(field.height || 7)))}%`,
	};
}

function RedactedDocumentPreview({ template }) {
	return (
		<div className="rounded-xl border border-white/10 bg-slate-950/70 p-3">
			{template.preview_image_url ? (
				<div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-lg border border-white/10 bg-slate-900 shadow-inner">
					<Image
						src={template.preview_image_url}
						alt={`${template.name} redacted sample`}
						width={720}
						height={455}
						unoptimized
						className="block max-h-72 max-w-full object-contain"
					/>
					{template.fields.map((field) => (
						<div
							key={field.id}
							style={fieldBoxStyle(field)}
							className="absolute rounded border border-white/70 bg-white/95 shadow-sm backdrop-blur-md"
							aria-label={`${field.field_label} hidden`}
						/>
					))}
					{template.fields.length === 0 ? (
						<div className="absolute inset-0 grid place-items-center text-sm font-semibold text-slate-400">
							No personal fields marked
						</div>
					) : null}
				</div>
			) : (
				<div className="relative mx-auto aspect-[1.58] max-h-72 w-full overflow-hidden rounded-lg border border-white/10 bg-slate-900 shadow-inner">
					<div className="absolute inset-0 bg-white">
						<div className="absolute inset-x-6 top-5 border-b border-slate-200 pb-3">
							<p className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
								{template.document_type || 'Digital document'}
							</p>
						</div>
					</div>
					{template.fields.map((field) => (
						<div
							key={field.id}
							style={fieldBoxStyle(field)}
							className="absolute rounded border border-white/70 bg-white/95 shadow-sm backdrop-blur-md"
							aria-label={`${field.field_label} hidden`}
						/>
					))}
					{template.fields.length === 0 ? (
						<div className="absolute inset-0 grid place-items-center text-sm font-semibold text-slate-400">
							No personal fields marked
						</div>
					) : null}
				</div>
			)}
		</div>
	);
}

function TemplatePreview({ template }) {
	return (
		<article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
			<div className="flex items-start justify-between gap-4">
				<div>
					<p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">
						Digitized template
					</p>
					<h2 className="mt-2 text-xl font-bold text-white">{template.name}</h2>
					<p className="mt-1 text-sm text-slate-300">
						{template.document_type || 'Unclassified'} · v{template.version}
					</p>
				</div>
				<span
					className={`rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusClass(
						template.status,
					)}`}>
					{template.status}
				</span>
			</div>

			<div className="mt-5 grid gap-5 lg:grid-cols-[0.85fr_1fr]">
				<RedactedDocumentPreview template={template} />

				<div>
					<h3 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-300">
						Digital fields
					</h3>
					<div className="mt-3 grid gap-2 sm:grid-cols-2">
						{template.fields.map((field) => (
							<div
								key={field.id}
								className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2">
								<p className="text-sm font-semibold text-white">{field.field_label}</p>
								<p className="mt-1 text-xs text-slate-400">
									{field.field_type}
									{field.required ? ' · required' : ''}
								</p>
							</div>
						))}
						{template.fields.length === 0 ? (
							<p className="rounded-lg border border-dashed border-white/15 p-4 text-sm text-slate-300 sm:col-span-2">
								No fields reviewed yet.
							</p>
						) : null}
					</div>
				</div>
			</div>
		</article>
	);
}

export default async function DigitalDocumentsPage() {
	const { templates, unavailable } = await getTemplates();
	const published = templates.filter((template) => template.status === 'published');
	const drafts = templates.filter((template) => template.status === 'draft');
	const featured = published[0] || templates[0];

	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 shadow-[0_0_80px_rgba(15,23,42,0.45)]">
				<div className="max-w-3xl">
					<p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-400">
						Digital Documents
					</p>
					<h1 className="mt-4 text-4xl font-bold tracking-tight text-white">
						Digitized documents and reusable samples.
					</h1>
					<p className="mt-4 text-lg leading-8 text-slate-300">
						Review published digital document templates, their captured fields,
						and the sample document layout issuers can reuse for new applications.
					</p>
				</div>
			</section>

			<section className="grid gap-4 sm:grid-cols-3">
				<div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
					<p className="text-sm text-slate-400">Published</p>
					<p className="mt-2 text-3xl font-bold text-white">{published.length}</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
					<p className="text-sm text-slate-400">Drafts</p>
					<p className="mt-2 text-3xl font-bold text-white">{drafts.length}</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
					<p className="text-sm text-slate-400">Total fields</p>
					<p className="mt-2 text-3xl font-bold text-white">
						{templates.reduce((sum, template) => sum + template.fields.length, 0)}
					</p>
				</div>
			</section>

			{unavailable ? (
				<section className="rounded-2xl border border-red-400/20 bg-red-400/10 p-6 text-sm text-red-100">
					Sign in as an issuer to view digitized documents.
				</section>
			) : null}

			{featured ? (
				<TemplatePreview template={featured} />
			) : (
				<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
					<div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
						<div className="rounded-xl border border-white/10 bg-slate-950/70 p-5">
							<div className="aspect-[1.58] rounded-lg border border-slate-300 bg-white p-5 shadow-inner">
								<p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
									Blank digital document
								</p>
								<div className="mt-8 h-20 w-20 rounded-lg border border-dashed border-slate-300 bg-slate-50" />
								<div className="mt-6 space-y-2">
									<div className="h-2 w-44 rounded bg-slate-200" />
									<div className="h-2 w-36 rounded bg-slate-200" />
									<div className="h-2 w-52 rounded bg-slate-200" />
								</div>
							</div>
						</div>
						<div>
							<div className="mb-5 grid h-12 w-12 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
								<PortalIcon name="template" className="h-6 w-6" />
							</div>
							<h2 className="text-2xl font-bold text-white">No digitized templates yet</h2>
							<p className="mt-3 text-sm leading-7 text-slate-300">
								Upload a sample ID, certificate, or card in Templates, run OCR, review
								the captured fields, then publish it to make it reusable here.
							</p>
							<div className="mt-5 flex flex-wrap gap-2">
								{sampleFields.map((field) => (
									<span
										key={field}
										className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs font-semibold text-slate-200">
										{field}
									</span>
								))}
							</div>
							<Link
								href="/issuer-portal/templates"
								className="mt-6 inline-flex rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600">
								Create template
							</Link>
						</div>
					</div>
				</section>
			)}

			<section className="grid gap-6 xl:grid-cols-2">
				{templates.map((template) => (
					<TemplatePreview key={template.id} template={template} />
				))}
			</section>
		</div>
	);
}
