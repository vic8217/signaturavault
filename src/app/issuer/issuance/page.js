export default function IssuerIssuance() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl bg-white p-10 shadow-sm border border-slate-200">
				<h1 className="text-3xl font-bold text-slate-900">Manual issuance</h1>
				<p className="mt-4 text-slate-600">
					Issue certificates, diplomas, and transcripts manually from the issuer
					portal, or connect external systems using the Issuer API.
				</p>
			</section>

			<section className="grid gap-6 lg:grid-cols-2">
				<div className="rounded-2xl border border-slate-200 bg-white p-8">
					<h2 className="text-xl font-bold text-slate-900">
						Document generation
					</h2>
					<p className="mt-3 text-sm leading-7">
						Select a template, add recipient details, and generate a verifiable
						digital document with QR token and blockchain anchor support.
					</p>
				</div>

				<div className="rounded-3xl border border-dashed border-zinc-200 bg-white p-8 text-zinc-600">
					<h2 className="text-xl font-semibold text-zinc-900">Bulk upload</h2>
					<p className="mt-3 text-sm leading-7">
						Upload CSV files to issue large batches of documents while
						preserving tenant isolation, audit trails, and revocation controls.
					</p>
				</div>
			</section>
		</div>
	);
}
