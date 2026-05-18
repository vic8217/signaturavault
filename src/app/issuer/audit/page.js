export default function IssuerAudit() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl bg-white p-10 shadow-sm border border-slate-200">
				<h1 className="text-3xl font-bold text-slate-900">Audit & activity</h1>
				<p className="mt-4 text-slate-600">
					Monitor all tenant events, including API calls, issuance actions,
					revocation decisions, and verification attempts.
				</p>
			</section>

			<section className="grid gap-6 lg:grid-cols-2">
				<div className="rounded-2xl border border-slate-200 bg-white p-8">
					<h2 className="text-xl font-bold text-slate-900">API logs</h2>
					<p className="mt-3 text-sm leading-7 text-slate-600">
						Review every request and response from tenant API clients to support
						security and incident analysis.
					</p>
				</div>

				<div className="rounded-2xl border border-slate-200 bg-white p-8">
					<h2 className="text-xl font-bold text-slate-900">Audit logs</h2>
					<p className="mt-3 text-sm leading-7 text-slate-600">
						Track issuer admin actions, user role changes, revocations, and
						template updates in a tenant-specific audit log.
					</p>
				</div>
			</section>
		</div>
	);
}
