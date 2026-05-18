import { PortalIcon } from '@/components/PortalIcon';

export default function WalletCredentials() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-7 shadow-[0_0_70px_rgba(15,23,42,0.42)]">
				<div className="mb-5 grid h-12 w-12 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
					<PortalIcon name="document" className="h-6 w-6" />
				</div>
				<h1 className="text-3xl font-bold text-white">My Credentials</h1>
				<p className="mt-4 text-slate-300">
					You have no credentials in your wallet yet. When issuers send you
					documents, they will appear here.
				</p>
			</section>

			<div className="rounded-2xl border border-dashed border-red-500/40 bg-red-500/10 p-12 text-center">
				<div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl border border-red-500/40 bg-slate-950 text-red-300">
					<PortalIcon name="document" className="h-7 w-7" />
				</div>
				<h2 className="text-xl font-bold text-white">No documents yet</h2>
				<p className="mt-2 text-slate-300">
					Documents will be added automatically when you receive them from
					issuers.
				</p>
			</div>
		</div>
	);
}
