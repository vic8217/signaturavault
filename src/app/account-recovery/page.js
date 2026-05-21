import Link from 'next/link';

const recoveryMethods = [
	{
		title: 'Use another trusted device',
		description:
			'Sign in from a device that already has a Signatura passkey, then remove the lost device from Security devices.',
		action: 'Try passkey again',
		href: 'login',
	},
	{
		title: 'Use a recovery code',
		description:
			'Enter one unused recovery code from onboarding. After access is restored, register a new trusted device immediately.',
		action: 'Use recovery code',
		href: 'recovery-code',
	},
	{
		title: 'Request manual identity recovery',
		description:
			'Issuer and admin accounts require organization approval and security review before access is restored.',
		action: 'Request manual recovery',
		href: 'manual',
	},
];

export default async function AccountRecoveryPage({ searchParams }) {
	const params = await searchParams;
	const email = typeof params?.email === 'string' ? params.email : '';
	const nextPath =
		typeof params?.next === 'string' && params.next.startsWith('/')
			? params.next
			: '/wallet';

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_80%_10%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-10 text-white">
			<div className="mx-auto mb-8 flex max-w-5xl items-center justify-between">
				<Link href="/" className="text-sm font-bold uppercase tracking-[0.18em]">
					Signatura
				</Link>
				<Link
					href={`/login?next=${encodeURIComponent(nextPath)}`}
					className="text-sm font-semibold text-red-200">
					Back to login
				</Link>
			</div>

			<section className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-950/90 p-6 shadow-2xl">
				<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
					Account recovery
				</p>
				<h1 className="mt-2 text-3xl font-black">
					Lost or unavailable trusted device
				</h1>
				<p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
					If your passkey device is lost, damaged, or unavailable, use one of
					the approved recovery methods below. Signatura does not allow
					email-only account recovery.
				</p>

				{email ? (
					<div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
						Recovery account: <span className="font-semibold">{email}</span>
					</div>
				) : null}

				<div className="mt-6 grid gap-4">
					{recoveryMethods.map((method, index) => {
						const href =
							method.href === 'login'
								? `/login?next=${encodeURIComponent(nextPath)}`
								: method.href === 'recovery-code'
									? `/account-recovery/recovery-code?next=${encodeURIComponent(
											nextPath,
										)}${email ? `&email=${encodeURIComponent(email)}` : ''}`
									: '/contact';

						return (
							<Link
							key={method.title}
							href={href}
							className="rounded-xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-red-400/60 hover:bg-red-500/10">
							<div className="flex gap-3">
								<div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-red-500/40 bg-red-500/10 text-sm font-black text-red-200">
									{index + 1}
								</div>
								<div>
									<h2 className="font-bold text-white">{method.title}</h2>
									<p className="mt-1 text-sm leading-6 text-slate-300">
										{method.description}
									</p>
									<p className="mt-3 text-sm font-bold text-red-200">
										{method.action}
									</p>
								</div>
							</div>
						</Link>
						);
					})}
				</div>

				<div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm leading-6 text-amber-100">
					For issuer administrators, manual recovery must be approved through
					the issuer organization. Messaging apps may be used for delivery, but
					they are not proof of identity.
				</div>

				<div className="mt-6 flex flex-col gap-3 sm:flex-row">
					<Link
						href={`/login?next=${encodeURIComponent(nextPath)}`}
						className="rounded-xl bg-red-500 px-5 py-3 text-center text-sm font-bold text-white transition hover:bg-red-400">
						Try passkey again
					</Link>
					<Link
						href="/contact"
						className="rounded-xl border border-white/15 px-5 py-3 text-center text-sm font-bold text-slate-200 transition hover:border-red-400 hover:text-white">
						Request manual recovery
					</Link>
				</div>
			</section>
		</main>
	);
}
