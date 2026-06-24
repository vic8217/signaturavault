'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Camera, Download, ExternalLink, Share, ShieldCheck } from 'lucide-react';

function isStandaloneMode() {
	if (typeof window === 'undefined') return false;
	return (
		window.matchMedia('(display-mode: standalone)').matches ||
		window.navigator.standalone === true
	);
}

export function PwaQrLoginGate({
	approvalPath = '/login/remote-approve/scan',
	scannerPath = '/login/remote-approve/scan',
	signaturaId = '',
	shortCode = '',
}) {
	const [deferredPrompt, setDeferredPrompt] = useState(null);
	const [hasPromptSettled, setHasPromptSettled] = useState(false);
	const [isInstalled, setIsInstalled] = useState(false);
	const [status, setStatus] = useState('');
	const hasChallenge = approvalPath.includes('/login/remote-approve?');
	const targetPath = hasChallenge ? approvalPath : scannerPath;
	const displayCode = useMemo(
		() =>
			String(shortCode || '')
				.trim()
				.toUpperCase()
				.split('')
				.join(' '),
		[shortCode],
	);

	useEffect(() => {
		if (isStandaloneMode()) {
			window.location.replace(targetPath);
			return undefined;
		}

		const readyTimer = window.setTimeout(() => setHasPromptSettled(true), 700);

		function storeInstallPrompt(event) {
			event.preventDefault();
			window.__signaturaPwaInstallPrompt = event;
			setDeferredPrompt(event);
			setHasPromptSettled(true);
			setStatus('Ready to install Signatura on this phone.');
		}

		function handleCapturedInstallPrompt() {
			const capturedPrompt = window.__signaturaPwaInstallPrompt;
			if (capturedPrompt) storeInstallPrompt(capturedPrompt);
		}

		function handleAppInstalled() {
			window.__signaturaPwaInstallPrompt = null;
			setDeferredPrompt(null);
			setHasPromptSettled(true);
			setIsInstalled(true);
			setStatus('Installation complete. Open Signatura, then continue approval.');
		}

		handleCapturedInstallPrompt();
		window.addEventListener('beforeinstallprompt', storeInstallPrompt);
		window.addEventListener(
			'signatura:pwa-install-ready',
			handleCapturedInstallPrompt,
		);
		window.addEventListener('appinstalled', handleAppInstalled);

		return () => {
			window.clearTimeout(readyTimer);
			window.removeEventListener('beforeinstallprompt', storeInstallPrompt);
			window.removeEventListener(
				'signatura:pwa-install-ready',
				handleCapturedInstallPrompt,
			);
			window.removeEventListener('appinstalled', handleAppInstalled);
		};
	}, [targetPath]);

	async function installApp() {
		if (isStandaloneMode() || isInstalled) {
			window.location.assign(targetPath);
			return;
		}
		if (!deferredPrompt) {
			setHasPromptSettled(true);
			setStatus('Use your browser install menu to add Signatura to this phone.');
			return;
		}

		deferredPrompt.prompt();
		const choice = await deferredPrompt.userChoice.catch(() => null);
		window.__signaturaPwaInstallPrompt = null;
		setDeferredPrompt(null);
		setHasPromptSettled(true);
		if (choice?.outcome === 'accepted') {
			setIsInstalled(true);
			setStatus('Installation complete. Open Signatura, then continue approval.');
		} else {
			setStatus('Installation was dismissed. Install Signatura before approving this login.');
		}
	}

	const showManualInstructions = hasPromptSettled && !deferredPrompt && !isInstalled;

	return (
		<main className="min-h-screen overflow-hidden bg-[#020817] text-white">
			<div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_82%_12%,rgba(239,68,68,0.22),transparent_30%),radial-gradient(circle_at_8%_88%,rgba(30,64,120,0.18),transparent_32%),linear-gradient(180deg,#020817_0%,#050b16_52%,#020817_100%)]" />
			<div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-between px-5 py-8 sm:max-w-lg sm:px-8">
				<div>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="grid h-12 w-12 place-items-center rounded-lg border border-red-500/45 bg-red-500/10">
								<ShieldCheck className="h-6 w-6 text-red-300" />
							</div>
							<div>
								<p className="text-xs font-bold uppercase tracking-[0.32em] text-red-300">
									Signatura
								</p>
								<p className="mt-1 text-xs text-slate-400">
									Trusted device approval
								</p>
							</div>
						</div>
						<Link
							href={targetPath}
							className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-200 transition hover:border-red-400/60 hover:text-white"
							aria-label="Continue trusted-device approval">
							<ExternalLink className="h-5 w-5" />
						</Link>
					</div>

					<div className="mt-12 text-center">
						<Image
							src="/signatura-logo.png"
							alt="Signatura logo"
							width={120}
							height={120}
							className="mx-auto h-28 w-28 object-contain drop-shadow-[0_0_35px_rgba(248,35,35,0.42)]"
						/>
						<h1 className="mt-8 text-4xl font-black leading-tight tracking-normal">
							Open in Signatura
						</h1>
						<p className="mx-auto mt-4 max-w-sm text-base leading-7 text-slate-300">
							Install or open the Signatura PWA to approve this browser sign-in
							with your trusted device.
						</p>
					</div>

					<div className="mt-10 rounded-lg border border-red-500/45 bg-slate-950/80 p-5 shadow-[0_0_70px_rgba(239,68,68,0.18)]">
						<div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-200">
							<p>
								<span className="font-semibold text-white">Purpose:</span>{' '}
								Approve trusted-device login
							</p>
							{signaturaId ? (
								<p className="mt-2">
									<span className="font-semibold text-white">Signatura ID:</span>{' '}
									<span className="font-mono">{signaturaId}</span>
								</p>
							) : null}
							{displayCode ? (
								<p className="mt-2">
									<span className="font-semibold text-white">Code:</span>{' '}
									<span className="font-mono tracking-[0.24em]">{displayCode}</span>
								</p>
							) : null}
						</div>

						<div className="mt-6 grid gap-3">
							<button
								type="button"
								onClick={installApp}
								className="flex min-h-14 w-full items-center justify-center gap-3 rounded-lg bg-red-500 px-5 py-4 text-base font-bold text-white shadow-[0_0_35px_rgba(239,68,68,0.35)] transition hover:bg-red-400 focus:outline-none focus:ring-2 focus:ring-red-300 focus:ring-offset-2 focus:ring-offset-slate-950">
								<Download className="h-5 w-5" />
								<span>{isInstalled ? 'Continue in Signatura' : 'Install Signatura'}</span>
								<ArrowRight className="h-5 w-5" />
							</button>
							<Link
								href={targetPath}
								className="flex min-h-14 w-full items-center justify-center gap-3 rounded-lg border border-white/15 bg-white/5 px-5 py-4 text-base font-bold text-white transition hover:border-red-400/70 hover:bg-red-500/10">
								<Camera className="h-5 w-5" />
								<span>{hasChallenge ? 'Continue Approval' : 'Open Scanner'}</span>
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
					The QR can be read by any camera, but approval still requires the
					matching Signatura trusted device and passkey.
				</p>
			</div>
		</main>
	);
}
