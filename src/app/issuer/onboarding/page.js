export default function IssuerOnboarding() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl bg-white p-10 shadow-sm border border-slate-200">
				<h1 className="text-3xl font-bold text-slate-900">Issuer onboarding</h1>
				<p className="mt-4 text-slate-600">
					Register new issuer tenants, invite admin users, and set up brand and
					API configuration for each customer.
				</p>
			</section>

			<section className="grid gap-6 lg:grid-cols-2">
				<div className="rounded-2xl border border-slate-200 bg-white p-8">
					<h2 className="text-xl font-bold text-slate-900">
						Tenant registration
					</h2>
					<p className="mt-3 text-sm leading-7">
						Collect issuer name, contact email, and tenant metadata so each
						issuer gets a dedicated secure environment.
					</p>
				</div>

				<div className="rounded-3xl border border-dashed border-zinc-200 bg-white p-8 text-zinc-600">
					<h2 className="text-xl font-semibold text-zinc-900">User roles</h2>
					<p className="mt-3 text-sm leading-7">
						Assign admin, reviewer, and operator roles and keep issuer access
						isolated by tenant_id.
					</p>
				</div>
			</section>
		</div>
	);
}
