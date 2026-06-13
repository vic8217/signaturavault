import { IssuerProfileForm } from '@/components/IssuerProfileForm';

export default function IssuerProfilePage() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/4 p-10 shadow-[0_0_80px_rgba(15,23,42,0.45)]">
				<div className="max-w-3xl">
					<p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-400">
						Profile
					</p>
					<h1 className="mt-4 text-4xl font-bold tracking-tight text-white">
						Issuer organization profile.
					</h1>
					<p className="mt-4 text-lg leading-8 text-slate-300">
						Manage the registered issuer name, logo, contact details, and
						organization metadata used across issuer workflows.
					</p>
				</div>
			</section>

			<IssuerProfileForm />
		</div>
	);
}
