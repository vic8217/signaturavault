export default function IssuerTemplates() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl bg-white p-10 shadow-sm border border-slate-200">
				<h1 className="text-3xl font-bold text-slate-900">
					Document templates
				</h1>
				<p className="mt-4 text-slate-600">
					Create and manage reusable templates for diplomas, transcripts,
					certificates, TORs, and other issued records.
				</p>
			</section>

			<section className="grid gap-6 lg:grid-cols-2">
				<div className="rounded-2xl border border-slate-200 bg-white p-8">
					<h2 className="text-xl font-bold text-slate-900">Template setup</h2>
					<p className="mt-3 text-sm leading-7">
						Assign document types, define required fields, and connect templates
						to issuance and verification workflows.
					</p>
				</div>

				<div className="rounded-3xl border border-dashed border-zinc-200 bg-white p-8 text-zinc-600">
					<h2 className="text-xl font-semibold text-zinc-900">
						Storage & signing
					</h2>
					<p className="mt-3 text-sm leading-7">
						Templates can be used with external storage connectors, QR
						generation, and document hash anchoring.
					</p>
				</div>
			</section>
		</div>
	);
}
