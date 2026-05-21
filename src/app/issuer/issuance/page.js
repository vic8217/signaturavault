import { IssuerTemplateIssuancePanel } from '@/components/IssuerTemplateIssuancePanel';

export default function IssuerIssuance() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 shadow-[0_0_80px_rgba(15,23,42,0.45)]">
				<h1 className="text-3xl font-bold text-white">Manual issuance</h1>
				<p className="mt-4 text-slate-300">
					Issue certificates, diplomas, and transcripts manually from the issuer
					portal, or connect external systems using the Issuer API.
				</p>
			</section>

			<IssuerTemplateIssuancePanel />

			<section className="grid gap-6 lg:grid-cols-2">
				<div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8">
					<h2 className="text-xl font-bold text-white">
						Document generation
					</h2>
					<p className="mt-3 text-sm leading-7 text-slate-300">
						Select a template, add recipient details, and generate a verifiable
						digital document with QR token and blockchain anchor support.
					</p>
				</div>

				<div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.04] p-8">
					<h2 className="text-xl font-semibold text-white">Bulk upload</h2>
					<p className="mt-3 text-sm leading-7 text-slate-300">
						Upload CSV files to issue large batches of documents while
						preserving tenant isolation, audit trails, and revocation controls.
					</p>
				</div>
			</section>
		</div>
	);
}
