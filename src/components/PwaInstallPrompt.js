'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
	ArrowRight,
	Download,
	ExternalLink,
	LogIn,
	Share,
	Smartphone,
} from 'lucide-react';

function isStandaloneMode() {
	if (typeof window === 'undefined') {
		return false;
	}

	return (
		window.matchMedia('(display-mode: standalone)').matches ||
		window.navigator.standalone === true
	);
}

export function PwaInstallPrompt() {
	const [deferredPrompt, setDeferredPrompt] = useState(null);
	const [hasPromptSettled, setHasPromptSettled] = useState(false);
	const [status, setStatus] = useState('');

	useEffect(() => {
		if (isStandaloneMode()) {
			window.location.replace('/login');
			return undefined;
		}

		const readyTimer = window.setTimeout(() => setHasPromptSettled(true), 700);

		function handleBeforeInstallPrompt(event) {
			event.preventDefault();
			setDeferredPrompt(event);
			setHasPromptSettled(true);
			setStatus('Ready to install on this device.');
		}

		function handleAppInstalled() {
			window.location.assign('/login');
		}

		window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
		window.addEventListener('appinstalled', handleAppInstalled);

		return () => {
			window.clearTimeout(readyTimer);
			window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
			window.removeEventListener('appinstalled', handleAppInstalled);
		};
	}, []);

	async function handleInstall() {
		if (isStandaloneMode()) {
			window.location.assign('/login');
			return;
		}

		if (!deferredPrompt) {
			setStatus('Use your browser install menu to add Signatura to this phone.');
			setHasPromptSettled(true);
			return;
		}

		deferredPrompt.prompt();

		const choice = await deferredPrompt.userChoice.catch(() => null);
		setDeferredPrompt(null);

		if (choice?.outcome === 'accepted') {
			window.location.assign('/login');
			return;
		}

		setStatus('Installation was dismissed. You can continue to login instead.');
	}

	const showManualInstructions = hasPromptSettled && !deferredPrompt;

	return (
		<div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-between px-5 py-8 text-white sm:max-w-lg sm:px-8">
			<div>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="grid h-12 w-12 place-items-center rounded-lg border border-red-500/45 bg-red-500/10">
							<Smartphone className="h-6 w-6 text-red-300" strokeWidth={2} />
						</div>
						<div>
							<p className="text-xs font-bold uppercase tracking-[0.32em] text-red-300">
								Signatura
							</p>
							<p className="mt-1 text-xs text-slate-400">Mobile PWA</p>
						</div>
					</div>
					<Link
						href="/login"
						className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-200 transition hover:border-red-400/60 hover:text-white"
						aria-label="Continue to login">
						<ExternalLink className="h-5 w-5" />
					</Link>
				</div>

				<div className="mt-14 text-center">
					<Image
						src="/signatura-logo.png"
						alt="Signatura logo"
						width={128}
						height={128}
						className="mx-auto h-32 w-32 object-contain drop-shadow-[0_0_35px_rgba(248,35,35,0.42)]"
					/>
					<h1 className="mt-8 text-4xl font-black leading-tight tracking-normal">
						Install Signatura App
					</h1>
					<p className="mx-auto mt-4 max-w-sm text-base leading-7 text-slate-300">
						Secure Zero Trust Level 2 access from your phone
					</p>
				</div>

				<div className="mt-10 rounded-lg border border-red-500/45 bg-slate-950/80 p-5 shadow-[0_0_70px_rgba(239,68,68,0.18)]">
					<p className="text-center text-sm leading-6 text-slate-300">
						After installation, Signatura opens directly to login.
					</p>

					<div className="mt-6 grid gap-3">
						<button
							type="button"
							onClick={handleInstall}
							className="flex min-h-14 w-full items-center justify-center gap-3 rounded-lg bg-red-500 px-5 py-4 text-base font-bold text-white shadow-[0_0_35px_rgba(239,68,68,0.35)] transition hover:bg-red-400 focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2 focus:ring-offset-slate-950">
							<Download className="h-5 w-5" />
							<span>Install App</span>
							<ArrowRight className="h-5 w-5" />
						</button>

						<Link
							href="/login"
							className="flex min-h-14 w-full items-center justify-center gap-3 rounded-lg border border-white/15 bg-white/5 px-5 py-4 text-base font-bold text-white transition hover:border-red-400/70 hover:bg-red-500/10">
							<LogIn className="h-5 w-5" />
							<span>Continue to Login</span>
						</Link>
					</div>

					{status ? (
						<p className="mt-4 text-center text-sm leading-6 text-slate-400">
							{status}
						</p>
					) : null}

					{showManualInstructions ? (
						<div className="mt-5 border-t border-white/10 pt-5">
							<div className="flex items-start gap-3 text-sm leading-6 text-slate-300">
								<Download className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
								<p>Android Chrome: tap menu then Add to Home screen</p>
							</div>
							<div className="mt-3 flex items-start gap-3 text-sm leading-6 text-slate-300">
								<Share className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
								<p>iPhone Safari: tap Share then Add to Home Screen</p>
							</div>
						</div>
					) : null}
				</div>
			</div>

			<p className="mt-10 text-center text-xs leading-5 text-slate-500">
				The QR code opens this install page only. Login still happens on the
				Signatura screen.
			</p>
		</div>
	);
}
