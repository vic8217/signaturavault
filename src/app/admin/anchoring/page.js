import { AdminAnchoringPanel } from '@/components/AdminAnchoringPanel';
import { PortalIcon } from '@/components/PortalIcon';

export default function AdminAnchoringPage() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-10">
				<div className="mb-5 grid h-12 w-12 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
					<PortalIcon name="qr" className="h-6 w-6" />
				</div>
				<h1 className="text-3xl font-bold text-white">Merkle anchoring</h1>
				<p className="mt-4 max-w-3xl text-slate-300">
					Batch document hashes into Merkle roots and publish only public
					proofs-of-existence. No personal data, document content, QR token, or
					verification token is published.
				</p>
			</section>

			<AdminAnchoringPanel />
		</div>
	);
}
