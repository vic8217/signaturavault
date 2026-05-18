export default function IssuerBulkUpload() {
	return (
		<div className="space-y-8">
			<section className="rounded-3xl bg-white p-10 shadow-sm">
				<h1 className="text-3xl font-semibold text-zinc-900">Bulk upload</h1>
				<p className="mt-4 text-zinc-600">
					Submit CSV files for mass issuance while preserving per-tenant
					isolation, audit tracking, and verification policies.
				</p>
			</section>

			<section className="rounded-3xl border border-dashed border-zinc-200 bg-white p-8 text-zinc-600">
				<h2 className="text-xl font-semibold text-zinc-900">
					CSV and bulk issuance
				</h2>
				<p className="mt-3 text-sm leading-7">
					Upload recipient lists, choose a document template, and create many
					signed documents with QR tokens and verification metadata.
				</p>
			</section>
		</div>
	);
}
