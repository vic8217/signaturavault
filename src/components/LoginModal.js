'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export function LoginModal({ defaultOpen = false }) {
	const [isOpen, setIsOpen] = useState(defaultOpen);

	useEffect(() => {
		if (defaultOpen) {
			setIsOpen(true);
		}
	}, [defaultOpen]);

	return (
		<>
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				aria-haspopup="dialog"
				className="rounded-xl border border-white/20 px-4 py-3 text-sm font-bold text-white transition hover:border-red-400 hover:text-red-300">
				Login
			</button>

			{isOpen ? (
				<div className="fixed left-0 top-0 z-[100] h-screen w-screen overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm">
					<div className="grid min-h-full place-items-start sm:place-items-center">
						<div
							className="mx-auto mt-4 w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950 text-white shadow-[0_0_90px_rgba(248,35,35,0.24)] sm:mt-0"
							role="dialog"
							aria-modal="true"
							aria-labelledby="login-modal-title">
							<div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
								<div>
									<p className="text-xs font-bold uppercase tracking-[0.22em] text-red-300">
										Signatura
									</p>
									<h2 id="login-modal-title" className="text-xl font-black">
										Passkey security
									</h2>
								</div>
								<button
									type="button"
									onClick={() => setIsOpen(false)}
									className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-slate-300 transition hover:border-red-400 hover:text-white"
									aria-label="Close login modal">
									X
								</button>
							</div>

							<div className="grid gap-5 p-5">
								<div className="grid gap-3 sm:grid-cols-2">
									<Link
										href="/login"
										className="rounded-xl bg-red-500 px-5 py-4 text-center text-sm font-bold text-white transition hover:bg-red-400">
										Sign in with passkey
									</Link>
									<Link
										href="/register"
										className="rounded-xl border border-red/15 px-5 py-4 text-center text-sm font-bold text-white transition hover:border-red-400 hover:text-red-400">
										Create account
									</Link>
								</div>
								<div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
									<p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">
										Portal access
									</p>
									<div className="mt-3 grid gap-3 sm:grid-cols-3">
										<Link
											href="/login?next=/signatura/dashboard"
											className="h-full w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-left transition hover:border-red-400 hover:bg-slate-800">
											<span className="block text-sm font-bold text-white">
												User Wallet
											</span>
											<span className="mt-1 block text-xs text-slate-400">
												Secure wallet sign-in
											</span>
										</Link>
										<Link
											href="/login?next=/issuer"
											className="h-full w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-left transition hover:border-red-400 hover:bg-slate-800">
											<span className="block text-sm font-bold text-white">
												Issuer Admin
											</span>
											<span className="mt-1 block text-xs text-slate-400">
												Secure issuer sign-in
											</span>
										</Link>
										<form action="/api/auth/session" method="post">
											<input
												type="hidden"
												name="role"
												value="SIGNATURA_ADMIN"
											/>
											<button className="h-full w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-left transition hover:border-red-400 hover:bg-slate-800">
												<span className="block text-sm font-bold text-white">
													Dev Admin
												</span>
												<span className="mt-1 block text-xs text-slate-400">
													Open Admin Console
												</span>
											</button>
										</form>
									</div>
								</div>
								<p className="text-sm leading-6 text-slate-300">
									Each browser or device is treated as a separate trusted
									device. New devices must be approved by passkey verification,
									a trusted device, QR approval, recovery code, or manual
									identity recovery.
								</p>
							</div>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
