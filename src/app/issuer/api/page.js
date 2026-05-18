export default function IssuerApi() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl bg-white p-10 shadow-sm border border-slate-200">
				<h1 className="text-3xl font-bold text-slate-900">
					Issuer API & webhooks
				</h1>
				<p className="mt-4 text-slate-600">
					Each issuer gets secure API credentials, per-tenant rate-limited
					endpoints, and webhook delivery for issuance, verification,
					revocation, and failed validation events.
				</p>
			</section>

			<section className="grid gap-6 lg:grid-cols-2">
				<div className="rounded-2xl bg-white p-8 shadow-sm border border-slate-200">
					<h2 className="text-xl font-bold text-slate-900">Authentication</h2>
					<p className="mt-3 text-sm leading-7 text-slate-600">
						Use a tenant-specific API key or OAuth client credentials. Never
						expose secrets in the frontend.
					</p>
					<ul className="mt-4 space-y-2 text-sm text-slate-600">
						<li>POST /api/issuers/register</li>
						<li>GET /api/issuers/{'[tenantId]'}/api-clients</li>
						<li>POST /api/issuers/{'[tenantId]'}/documents</li>
						<li>POST /api/issuers/{'[tenantId]'}/hashes</li>
						<li>POST /api/issuers/{'[tenantId]'}/qr</li>
						<li>POST /api/issuers/{'[tenantId]'}/revoke</li>
						<li>GET /api/issuers/{'[tenantId]'}/verify?token=...</li>
					</ul>
				</div>

				<div className="rounded-3xl bg-white p-8 shadow-sm">
					<h2 className="text-xl font-semibold text-zinc-900">
						Webhook support
					</h2>
					<p className="mt-3 text-sm leading-7 text-zinc-600">
						Register webhook URLs to receive signed events for issuance,
						verification, revocation, and failed validation.
					</p>
					<p className="mt-4 text-sm leading-7 text-zinc-600">
						Webhooks are verified using a shared secret and signature header to
						protect callback integrity.
					</p>
				</div>
			</section>
		</div>
	);
}
