import { PortalIcon } from '@/components/PortalIcon';

export default function AdminDashboard() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 shadow-[0_0_80px_rgba(15,23,42,0.45)]">
				<p className="text-sm font-bold uppercase tracking-[0.3em] text-red-400">
					Dev Admin
				</p>
				<h1 className="mt-4 text-3xl font-bold text-white">Admin Dashboard</h1>
				<p className="mt-4 text-slate-300">
					System overview and administrative controls for Signatura platform
					management.
				</p>
			</section>

			<div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
				{[
					{ icon: 'bank', label: 'Total Issuers', value: '0' },
					{ icon: 'shield', label: 'Active Tenants', value: '0' },
					{ icon: 'document', label: 'Documents Issued', value: '0' },
					{ icon: 'qr', label: 'Verifications Today', value: '0' },
				].map((card) => (
					<div
						key={card.label}
						className="rounded-xl border border-white/10 bg-white/[0.04] p-6">
						<div className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
							<PortalIcon name={card.icon} className="h-5 w-5" />
						</div>
						<p className="text-sm text-slate-300 font-medium">{card.label}</p>
						<p className="text-3xl font-bold text-white mt-2">
							{card.value}
						</p>
					</div>
				))}
			</div>

			<div className="grid md:grid-cols-2 gap-6">
				<div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8">
					<div className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
						<PortalIcon name="audit" className="h-5 w-5" />
					</div>
					<h2 className="text-xl font-bold text-white mb-4">
						Recent Activity
					</h2>
					<p className="text-slate-300">No recent activity to display.</p>
				</div>

				<div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8">
					<div className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
						<PortalIcon name="system" className="h-5 w-5" />
					</div>
					<h2 className="text-xl font-bold text-white mb-4">
						System Status
					</h2>
					<ul className="space-y-2 text-sm">
						<li className="flex items-center gap-2">
							<PortalIcon name="check" className="h-4 w-4 text-red-400" />
							<span className="text-slate-300">API: Operational</span>
						</li>
						<li className="flex items-center gap-2">
							<PortalIcon name="check" className="h-4 w-4 text-red-400" />
							<span className="text-slate-300">Database: Operational</span>
						</li>
						<li className="flex items-center gap-2">
							<PortalIcon name="check" className="h-4 w-4 text-red-400" />
							<span className="text-slate-300">
								Blockchain Sync: Operational
							</span>
						</li>
					</ul>
				</div>
			</div>
		</div>
	);
}
