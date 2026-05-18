import { PortalIcon } from '@/components/PortalIcon';

export default function AdminAnalytics() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-10">
				<div className="mb-5 grid h-12 w-12 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
					<PortalIcon name="audit" className="h-6 w-6" />
				</div>
				<h1 className="text-3xl font-bold text-white">
					Platform Analytics
				</h1>
				<p className="mt-4 text-slate-300">
					System-wide metrics and insights across all issuers and documents.
				</p>
			</section>

			<div className="grid md:grid-cols-3 gap-6">
				{[
					{ label: 'Documents Issued (30d)', value: '0' },
					{ label: 'Verification Rate', value: '0%' },
					{ label: 'API Calls (30d)', value: '0' },
				].map((card) => (
					<div
						key={card.label}
						className="rounded-xl border border-white/10 bg-white/[0.04] p-6">
						<p className="text-sm text-slate-300 font-medium">{card.label}</p>
						<p className="text-3xl font-bold text-red-300 mt-2">{card.value}</p>
					</div>
				))}
			</div>
		</div>
	);
}
