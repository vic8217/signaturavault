import Link from 'next/link';
import { IssuerInvitationForm } from '@/components/IssuerInvitationForm';

const steps = [
	{
		title: 'Register tenant',
		text: 'Create the issuer tenant record and assign the first admin user.',
	},
	{
		title: 'Send activation link',
		text: 'Deliver a single-use link to /issuer/activate through your approved channel.',
	},
	{
		title: 'Register trusted device',
		text: 'The invited user registers a passkey before opening the issuer portal.',
	},
	{
		title: 'Sign in to /issuer',
		text: 'Issuer staff authenticate with trusted-device approval and land on /issuer.',
	},
];

export default function IssuerOnboarding() {
	return (
		<div className="space-y-8">
			<section className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-[0_0_80px_rgba(15,23,42,0.45)]">
				<p className="text-sm font-semibold uppercase tracking-[0.3em] text-red-400">
					Issuer onboarding
				</p>
				<h1 className="mt-4 text-4xl font-bold tracking-tight text-white">
					Bring a new issuer tenant online
				</h1>
				<p className="mt-4 max-w-3xl text-lg leading-8 text-slate-300">
					Register tenants, invite issuer admins, and issue activation links that
					open the canonical /issuer portal after trusted-device setup.
				</p>
				<div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
					<Link
						href="/login?next=/issuer"
						className="rounded-xl bg-red-500 px-5 py-3 text-white transition hover:bg-red-400">
						Issuer sign-in
					</Link>
					<Link
						href="/issuer/activate"
						className="rounded-xl border border-white/15 px-5 py-3 text-slate-200 transition hover:border-red-400 hover:text-white">
						Open activation page
					</Link>
				</div>
			</section>

			<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				{steps.map((step, index) => (
					<div
						key={step.title}
						className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
						<p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">
							Step {index + 1}
						</p>
						<h2 className="mt-3 text-lg font-bold text-white">{step.title}</h2>
						<p className="mt-2 text-sm leading-6 text-slate-400">{step.text}</p>
					</div>
				))}
			</section>

			<section className="grid gap-6 lg:grid-cols-2">
				<div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
					<h2 className="text-xl font-bold text-white">Tenant registration</h2>
					<p className="mt-3 text-sm leading-7 text-slate-300">
						Collect issuer name, contact email, and tenant metadata so each
						issuer gets a dedicated secure environment with tenant_id isolation.
					</p>
				</div>

				<div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/40 p-6">
					<h2 className="text-xl font-bold text-white">User roles</h2>
					<p className="mt-3 text-sm leading-7 text-slate-400">
						Assign issuer admin or staff roles. Activation links always target
						/issuer/activate and post-login redirects use /issuer.
					</p>
				</div>
			</section>

			<IssuerInvitationForm />
		</div>
	);
}
