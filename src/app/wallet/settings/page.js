import { PortalIcon } from '@/components/PortalIcon';

export default function WalletSettings() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-7 shadow-[0_0_70px_rgba(15,23,42,0.42)]">
				<div className="mb-5 grid h-12 w-12 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
					<PortalIcon name="lock" className="h-6 w-6" />
				</div>
				<h1 className="text-3xl font-bold text-white">Wallet Settings</h1>
				<p className="mt-4 text-slate-300">
					Manage your wallet preferences and security settings.
				</p>
			</section>

			<div className="max-w-2xl rounded-2xl border border-white/10 bg-white/[0.04] p-8">
				<h2 className="mb-6 text-xl font-bold text-white">
					Privacy & Sharing
				</h2>
				<div className="space-y-4">
					<label className="flex items-center gap-3 cursor-pointer">
						<input
							type="checkbox"
							defaultChecked
							className="h-4 w-4 rounded border-slate-600 accent-red-500"
						/>
						<span className="text-slate-200">
							Allow automatic credential storage
						</span>
					</label>
					<label className="flex items-center gap-3 cursor-pointer">
						<input
							type="checkbox"
							defaultChecked
							className="h-4 w-4 rounded border-slate-600 accent-red-500"
						/>
						<span className="text-slate-200">
							Notify when credentials are verified
						</span>
					</label>
					<label className="flex items-center gap-3 cursor-pointer">
						<input
							type="checkbox"
							className="h-4 w-4 rounded border-slate-600 accent-red-500"
						/>
						<span className="text-slate-200">
							Allow analytics on credential usage
						</span>
					</label>
				</div>
			</div>
		</div>
	);
}
