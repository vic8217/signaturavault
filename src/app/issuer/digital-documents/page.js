import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireIssuerContext } from '@/lib/issuer-templates';
import { PortalIcon } from '@/components/PortalIcon';

function statusClass(status) {
	const normalized = String(status || '').toLowerCase();
	if (normalized === 'valid' || normalized === 'issued') {
		return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200';
	}
	if (normalized === 'revoked') {
		return 'border-red-400/30 bg-red-400/10 text-red-100';
	}
	if (normalized === 'expired') {
		return 'border-amber-300/30 bg-amber-300/10 text-amber-100';
	}
	return 'border-slate-400/20 bg-slate-400/10 text-slate-300';
}

function formatDate(value) {
	if (!value) return 'Not issued';
	return new Intl.DateTimeFormat('en', {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(value));
}

function shortHash(value) {
	const text = String(value || '');
	if (text.length <= 20) return text;
	return `${text.slice(0, 10)}...${text.slice(-8)}`;
}

async function getIssuedDocuments() {
	const context = await requireIssuerContext();
	if (context.error) return { documents: [], unavailable: true };

	const records = await prisma.documentRecord.findMany({
		where: {
			tenantId: context.tenantId,
			...(context.issuerId ? { issuerId: context.issuerId } : {}),
		},
		orderBy: { issuedAt: 'desc' },
		take: 100,
	});

	return {
		unavailable: false,
		documents: records.filter((record) => record.metadata?.credential?.mode === 'template_issuance').map((record) => {
			const credential = record.metadata?.credential || {};
			return {
				id: record.id,
				templateName: credential.templateName || 'Digital credential',
				templateVersion: credential.templateVersion || null,
				documentNumber: credential.documentNumber || record.externalId,
				status: record.status,
				anchorStatus: record.anchorStatus,
				documentHash: record.documentHash || record.hash,
				verificationUrl: credential.verificationUrl || `/verify?token=${record.qrToken}`,
				recipientNameHash: credential.recipientNameHash || '',
				issuedAt: record.issuedAt,
				privateValuesEncrypted: Boolean(credential.fieldValuesEncrypted),
				publicFields: credential.publicFields || {},
			};
		}),
	};
}

function DocumentCard({ document }) {
	return (
		<article className="rounded-2xl border border-white/10 bg-white/4 p-5">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">
						Issued Digital Credential
					</p>
					<h2 className="mt-2 text-xl font-bold text-white">
						{document.templateName}
						{document.templateVersion ? ` v${document.templateVersion}` : ''}
					</h2>
					<p className="mt-1 font-mono text-sm text-slate-300">
						{document.documentNumber}
					</p>
				</div>
				<span
					className={`w-fit rounded-full border px-3 py-1 text-xs font-bold uppercase ${statusClass(
						document.status,
					)}`}>
					{document.status === 'valid' ? 'issued' : document.status}
				</span>
			</div>

			<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
					<p className="text-xs uppercase tracking-wide text-slate-500">
						Issued at
					</p>
					<p className="mt-1 text-sm text-slate-100">
						{formatDate(document.issuedAt)}
					</p>
				</div>
				<div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
					<p className="text-xs uppercase tracking-wide text-slate-500">
						Anchor
					</p>
					<p className="mt-1 text-sm capitalize text-slate-100">
						{document.anchorStatus || 'pending'}
					</p>
				</div>
				<div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
					<p className="text-xs uppercase tracking-wide text-slate-500">
						Document hash
					</p>
					<p className="mt-1 font-mono text-sm text-slate-100">
						{shortHash(document.documentHash)}
					</p>
				</div>
				<div className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
					<p className="text-xs uppercase tracking-wide text-slate-500">
						Private fields
					</p>
					<p className="mt-1 text-sm text-slate-100">
						{document.privateValuesEncrypted ? 'Encrypted' : 'Not stored'}
					</p>
				</div>
			</div>

			<div className="mt-4 rounded-xl border border-white/10 bg-slate-950/60 p-3">
				<p className="text-xs uppercase tracking-wide text-slate-500">
					Verification link
				</p>
				<p className="mt-1 break-all text-sm text-slate-100">
					{document.verificationUrl}
				</p>
			</div>
		</article>
	);
}

export default async function DigitalDocumentsPage() {
	const { documents, unavailable } = await getIssuedDocuments();
	const issued = documents.filter((document) => document.status === 'valid');
	const revoked = documents.filter((document) => document.status === 'revoked');
	const pendingAnchor = documents.filter(
		(document) => document.anchorStatus === 'pending',
	);

	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/4 p-10 shadow-[0_0_80px_rgba(15,23,42,0.45)]">
				<div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
					<div className="max-w-3xl">
						<p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-400">
							Digital Documents
						</p>
						<h1 className="mt-4 text-4xl font-bold tracking-tight text-white">
							Issued credentials and verification activity.
						</h1>
						<p className="mt-4 text-lg leading-8 text-slate-300">
							This page shows issued digital credentials. Reusable source layouts
							live in Templates; issuance combines a published template with
							recipient data to create a verifiable credential.
						</p>
					</div>
					<Link
						href="/issuer/issuance"
						className="inline-flex w-fit items-center gap-2 rounded-lg bg-red-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-600">
						<PortalIcon name="document" className="h-4 w-4" />
						New issuance
					</Link>
				</div>
			</section>

			<section className="grid gap-4 sm:grid-cols-4">
				<div className="rounded-2xl border border-white/10 bg-white/4 p-5">
					<p className="text-sm text-slate-400">Issued</p>
					<p className="mt-2 text-3xl font-bold text-white">{issued.length}</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-white/4 p-5">
					<p className="text-sm text-slate-400">Revoked</p>
					<p className="mt-2 text-3xl font-bold text-white">{revoked.length}</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-white/4 p-5">
					<p className="text-sm text-slate-400">Pending Anchor</p>
					<p className="mt-2 text-3xl font-bold text-white">
						{pendingAnchor.length}
					</p>
				</div>
				<div className="rounded-2xl border border-white/10 bg-white/4 p-5">
					<p className="text-sm text-slate-400">Verification Ready</p>
					<p className="mt-2 text-3xl font-bold text-white">
						{documents.filter((document) => document.verificationUrl).length}
					</p>
				</div>
			</section>

			{unavailable ? (
				<section className="rounded-2xl border border-red-400/20 bg-red-400/10 p-6 text-sm text-red-100">
					Sign in as an issuer to view issued digital documents.
				</section>
			) : null}

			{documents.length ? (
				<section className="grid gap-6">
					{documents.map((document) => (
						<DocumentCard key={document.id} document={document} />
					))}
				</section>
			) : (
				<section className="rounded-2xl border border-white/10 bg-white/4 p-6">
					<h2 className="text-2xl font-bold text-white">
						No issued digital documents yet
					</h2>
					<p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
						Publish a reusable template, then issue a credential from the Issuance
						module. Uploaded samples are never treated as issued documents.
					</p>
					<div className="mt-5 flex flex-wrap gap-3">
						<Link
							href="/issuer/templates"
							className="rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-slate-100 transition hover:border-red-400 hover:text-red-200">
							Create template
						</Link>
						<Link
							href="/issuer/issuance"
							className="rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600">
							New issuance
						</Link>
					</div>
				</section>
			)}
		</div>
	);
}
