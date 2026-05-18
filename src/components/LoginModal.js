'use client';

import Image from 'next/image';
import { useState } from 'react';

const roleOptions = [
	['SIGNATURA_ADMIN', 'Dev Admin', 'Admin console'],
	['SIGNATURA_STAFF', 'Dev Staff', 'Admin console'],
	['ISSUER_ADMIN', 'Issuer Admin', 'Issuer portal'],
	['ISSUER_STAFF', 'Issuer Staff', 'Issuer portal'],
];

export function LoginModal() {
	const [isOpen, setIsOpen] = useState(false);
	const [mode, setMode] = useState('login');

	return (
		<>
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				className="rounded-xl border border-white/20 px-4 py-3 text-sm font-bold text-white transition hover:border-red-400 hover:text-red-300">
				Login
			</button>

			{isOpen ? (
				<div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 px-4 py-6 backdrop-blur-sm">
					<div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950 text-white shadow-[0_0_90px_rgba(248,35,35,0.24)]">
						<div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
							<div className="flex items-center gap-3">
								<Image
									src="/signatura-logo.png"
									alt="Signatura logo"
									width={42}
									height={49}
									className="h-10 w-10 object-contain"
								/>
								<div>
									<p className="text-xs font-bold uppercase tracking-[0.22em] text-red-300">
										Signatura
									</p>
									<h2 className="text-xl font-black">
										{mode === 'login' ? 'Login' : 'Create account'}
									</h2>
								</div>
							</div>
							<button
								type="button"
								onClick={() => setIsOpen(false)}
								className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-slate-300 transition hover:border-red-400 hover:text-white"
								aria-label="Close login modal">
								X
							</button>
						</div>

						<div className="p-5">
							<div className="grid grid-cols-2 rounded-xl border border-white/10 bg-white/[0.04] p-1">
								<button
									type="button"
									onClick={() => setMode('login')}
									className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
										mode === 'login'
											? 'bg-red-500 text-white'
											: 'text-slate-300 hover:text-white'
									}`}>
									Login
								</button>
								<button
									type="button"
									onClick={() => setMode('register')}
									className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
										mode === 'register'
											? 'bg-red-500 text-white'
											: 'text-slate-300 hover:text-white'
									}`}>
									Register
								</button>
							</div>

							<form action="/api/auth/session" method="post" className="mt-5 grid gap-4">
								<input type="hidden" name="role" value="DOCUMENT_OWNER" />
								<div className="grid gap-2">
									<label
										htmlFor="username"
										className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
										Username
									</label>
									<input
										id="username"
										name="username"
										className="rounded-xl border border-white/10 bg-[#030914] px-4 py-3 text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
										placeholder="your.username"
										autoComplete="username"
									/>
								</div>
								<div className="grid gap-2">
									<label
										htmlFor="password"
										className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
										Password
									</label>
									<input
										id="password"
										name="password"
										type="password"
										className="rounded-xl border border-white/10 bg-[#030914] px-4 py-3 text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
										placeholder="Password"
										autoComplete={
											mode === 'login' ? 'current-password' : 'new-password'
										}
									/>
								</div>
								<button className="rounded-xl bg-red-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-red-400">
									{mode === 'login' ? 'Login as Document Owner' : 'Register New User'}
								</button>
							</form>

							<div className="mt-6">
								<p className="text-xs font-bold uppercase tracking-[0.18em] text-red-300">
									Developer and issuer demo roles
								</p>
								<div className="mt-3 grid gap-3 sm:grid-cols-2">
									{roleOptions.map(([role, label, target]) => (
										<form key={role} action="/api/auth/session" method="post">
											<input type="hidden" name="role" value={role} />
											<button className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:border-red-400 hover:bg-white/[0.06]">
												<span className="block text-sm font-bold text-white">
													{label}
												</span>
												<span className="mt-1 block text-xs text-slate-400">
													Open {target}
												</span>
											</button>
										</form>
									))}
								</div>
							</div>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
