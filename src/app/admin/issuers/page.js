import { PortalIcon } from '@/components/PortalIcon';

export default function AdminIssuers() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-10">
				<div className="mb-5 grid h-12 w-12 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
					<PortalIcon name="bank" className="h-6 w-6" />
				</div>
				<h1 className="text-3xl font-bold text-white">Manage Issuers</h1>
				<p className="mt-4 text-slate-300">
					View, onboard, and manage all issuer tenants on the platform.
				</p>
			</section>

			<div className="rounded-2xl border border-dashed border-red-500/40 bg-red-500/10 p-12 text-center">
				<div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl border border-red-500/40 bg-slate-950 text-red-300">
					<PortalIcon name="bank" className="h-7 w-7" />
				</div>
				<h2 className="text-xl font-bold text-white">
					No issuers registered yet
				</h2>
				<p className="mt-2 text-slate-300">
					Issuers can register through the portal at /issuer-portal or through
					the API.
				</p>
			</div>
		</div>
	);
}
