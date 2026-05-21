import { IssuerDocumentSummary } from '@/components/IssuerDocumentSummary';

export default function IssuerHome() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-10 shadow-[0_0_80px_rgba(15,23,42,0.45)]">
				<div className="max-w-3xl">
					<p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-400">
						Issuer Portal
					</p>
					<h1 className="mt-4 text-4xl font-bold tracking-tight text-white">
						Secure tenant portal for document issuance.
					</h1>
					<p className="mt-4 text-lg leading-8 text-slate-300">
						Signatura gives each issuer a private tenant environment with
						onboarding, templates, document issuance, revocation workflows,
						audit logs, and API access.
					</p>
				</div>
			</section>

			<IssuerDocumentSummary />
		</div>
	);
}
