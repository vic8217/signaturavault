export default function IssuerRevocation() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl bg-white p-10 shadow-sm border border-slate-200">
				<h1 className="text-3xl font-bold text-slate-900">
					Revocation management
				</h1>
				<p className="mt-4 text-slate-600">
					Revoke documents, update verification status, and maintain a trusted
					record of revoked credentials.
				</p>
			</section>

			<section className="grid gap-6 lg:grid-cols-2">
				<div className="rounded-2xl border border-slate-200 bg-white p-8">
					<h2 className="text-xl font-bold text-slate-900">
						Revocation workflows
					</h2>
					<p className="mt-3 text-sm leading-7">
						Choose manual revocation by document or automate revocation from
						integrated systems.
					</p>
				</div>

				<div className="rounded-3xl border border-dashed border-zinc-200 bg-white p-8 text-zinc-600">
					<h2 className="text-xl font-semibold text-zinc-900">
						Verification status
					</h2>
					<p className="mt-3 text-sm leading-7">
						Expose a verification endpoint that reports valid, revoked, and
						invalid document status for external subscribers.
					</p>
				</div>
			</section>
		</div>
	);
}
