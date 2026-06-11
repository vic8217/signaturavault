import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PortalIcon } from '@/components/PortalIcon';
import {
	getRegisteredIssuers,
	issuerTypeFromSlug,
	issuerTypeSlug,
	issuerTypes,
} from '@/lib/issuer-registry';

function normalizeIdentity(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

export function generateStaticParams() {
	return issuerTypes.map((type) => ({ type: issuerTypeSlug(type) }));
}

export default async function WalletIssuerTypePage({ params }) {
	const { type: typeSlug } = await params;
	const selectedType = issuerTypeFromSlug(typeSlug);

	if (issuerTypeSlug(selectedType) !== typeSlug) {
		notFound();
	}

	const issuers = (await getRegisteredIssuers()).filter(
		(issuer) =>
			normalizeIdentity(issuer.type || 'Others') ===
			normalizeIdentity(selectedType),
	);

	return (
		<div className="space-y-6">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
				<Link
					href="/signatura/documents/issuers"
					className="text-sm font-semibold text-red-300 transition hover:text-white">
					Back to classifications
				</Link>
				<p className="mt-5 text-sm font-semibold uppercase tracking-[0.3em] text-red-400">
					Issuers
				</p>
				<h1 className="mt-3 text-3xl font-bold text-white">
					{selectedType}
				</h1>
				<p className="mt-4 text-sm leading-6 text-slate-300">
					Registered issuers under this classification.
				</p>
			</section>

			<section className="grid gap-4">
				{issuers.length > 0 ? (
					issuers.map((issuer) => (
						<article
							key={issuer.id}
							className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
							<div className="flex gap-4">
								<div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
									<PortalIcon name="bank" className="h-5 w-5" />
								</div>
								<div className="min-w-0 flex-1">
									<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
										<div>
											<h2 className="font-bold text-white">{issuer.name}</h2>
											<p className="mt-1 text-xs text-slate-400">
												{issuer.type || 'Issuer'}
											</p>
										</div>
										<span className="w-fit rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-200">
											{issuer.status || 'active'}
										</span>
									</div>
									<div className="mt-3 grid gap-1 text-sm leading-6 text-slate-300">
										<p>{issuer.address || 'No address recorded'}</p>
										<p className="break-all text-xs text-slate-500">
											Registration:{' '}
											{issuer.registration_number || 'Not provided'}
										</p>
									</div>
								</div>
							</div>
						</article>
					))
				) : (
					<article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
						<div className="flex gap-4">
							<div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-red-500/40 bg-red-500/10 text-red-300">
								<PortalIcon name="bank" className="h-5 w-5" />
							</div>
							<div>
								<h2 className="font-bold text-white">
									No issuers in this classification yet
								</h2>
								<p className="mt-2 text-sm leading-6 text-slate-300">
									Registered issuers will appear here when Dev Admin assigns this
									classification.
								</p>
							</div>
						</div>
					</article>
				)}
			</section>
		</div>
	);
}
