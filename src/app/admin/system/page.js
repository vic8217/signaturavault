import { PortalIcon } from '@/components/PortalIcon';

export default function AdminSystem() {
	const publishMethod = process.env.ANCHOR_PUBLISH_METHOD || 'Not configured';
	const chain = process.env.ANCHOR_CHAIN || 'Not configured';

	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-10">
				<div className="mb-5 grid h-12 w-12 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
					<PortalIcon name="system" className="h-6 w-6" />
				</div>
				<h1 className="text-3xl font-bold text-white">
					System Configuration
				</h1>
				<p className="mt-4 text-slate-300">
					Manage global settings, rate limits, and blockchain configuration.
				</p>
			</section>

			<div className="grid md:grid-cols-2 gap-6">
				<div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8">
					<div className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
						<PortalIcon name="api" className="h-5 w-5" />
					</div>
					<h2 className="text-xl font-bold text-white mb-4">
						Rate Limiting
					</h2>
					<ul className="space-y-2 text-sm text-slate-300">
						<li>API requests per minute: 1000</li>
						<li>Documents per day per tenant: 10000</li>
						<li>Webhook retries: 5</li>
					</ul>
				</div>

				<div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8">
					<div className="mb-5 grid h-11 w-11 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
						<PortalIcon name="shield" className="h-5 w-5" />
					</div>
					<h2 className="text-xl font-bold text-white mb-4">Blockchain</h2>
					<ul className="space-y-2 text-sm text-slate-300">
						<li>Publish method: {publishMethod}</li>
						<li>Network: {chain}</li>
						<li>Anchor interval: Every 24 hours</li>
						<li>Pending anchors: 0</li>
					</ul>
				</div>
			</div>
		</div>
	);
}
