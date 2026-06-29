'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Download, ExternalLink, ShieldCheck } from 'lucide-react';

function isMobileClient() {
	if (typeof window === 'undefined') return false;
	return /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent || '');
}

function isStandaloneMode() {
	if (typeof window === 'undefined') return false;
	return (
		window.matchMedia?.('(display-mode: standalone)')?.matches ||
		window.navigator.standalone === true
	);
}

async function hasInstalledRelatedApp() {
	if (typeof window === 'undefined') return false;
	if (typeof window.navigator.getInstalledRelatedApps !== 'function') {
		return false;
	}
	try {
		const apps = await window.navigator.getInstalledRelatedApps();
		return Array.isArray(apps) && apps.length > 0;
	} catch {
		return false;
	}
}

export function AppApprovalInstallGate({
	app = 'ACCURA',
	requestedRole = '',
	approvalPath = '',
	nextPath = '',
	children,
}) {
	const [ready, setReady] = useState(false);
	const [shouldPromptInstall, setShouldPromptInstall] = useState(false);
	const [deferredPrompt, setDeferredPrompt] = useState(null);
	const [status, setStatus] = useState('');

	useEffect(() => {
		let cancelled = false;

		async function detectInstallState() {
			if (!isMobileClient() || isStandaloneMode()) {
				if (!cancelled) setReady(true);
				return;
			}

			const installed = await hasInstalledRelatedApp();
			if (cancelled) return;
			if (installed) {
				setReady(true);
				return;
			}

			setShouldPromptInstall(true);
			setStatus('Install Signatura first, then continue this ACCURA approval.');
		}

		function storeInstallPrompt(event) {
			event.preventDefault();
			window.__signaturaPwaInstallPrompt = event;
			setDeferredPrompt(event);
			setShouldPromptInstall(true);
			setStatus('Signatura is ready to install on this phone.');
		}

		function handleCapturedInstallPrompt() {
			const capturedPrompt = window.__signaturaPwaInstallPrompt;
			if (capturedPrompt) storeInstallPrompt(capturedPrompt);
		}

		function handleAppInstalled() {
			window.__signaturaPwaInstallPrompt = null;
			setDeferredPrompt(null);
			setStatus('Installation complete. Continue with ACCURA approval.');
		}

		handleCapturedInstallPrompt();
		void detectInstallState();
		window.addEventListener('beforeinstallprompt', storeInstallPrompt);
		window.addEventListener('signatura:pwa-install-ready', handleCapturedInstallPrompt);
		window.addEventListener('appinstalled', handleAppInstalled);

		return () => {
			cancelled = true;
			window.removeEventListener('beforeinstallprompt', storeInstallPrompt);
			window.removeEventListener('signatura:pwa-install-ready', handleCapturedInstallPrompt);
			window.removeEventListener('appinstalled', handleAppInstalled);
		};
	}, []);

	async function installApp() {
		const prompt = deferredPrompt || window.__signaturaPwaInstallPrompt;
		if (!prompt) {
			setStatus('Use your browser menu to install Signatura, then continue here.');
			return;
		}

		prompt.prompt();
		const choice = await prompt.userChoice.catch(() => null);
		window.__signaturaPwaInstallPrompt = null;
		setDeferredPrompt(null);
		setStatus(
			choice?.outcome === 'accepted'
				? 'Installation complete. Continue with ACCURA approval.'
				: 'Installation was dismissed. You can still continue in this trusted browser.',
		);
	}

	function continueApproval() {
		if (nextPath) {
			window.location.assign(nextPath);
			return;
		}
		setReady(true);
	}

	if (ready) return children;

	if (!shouldPromptInstall) {
		return (
			<section className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-950/90 p-6 text-white shadow-2xl">
				<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
					Signatura
				</p>
				<h1 className="mt-2 text-2xl font-black">Preparing ACCURA approval</h1>
			</section>
		);
	}

	return (
		<section className="mx-auto w-full max-w-2xl rounded-2xl border border-red-500/30 bg-slate-950/90 p-6 text-white shadow-2xl">
			<div className="flex items-center gap-4">
				<span className="grid h-12 w-12 place-items-center text-red-300">
					<ShieldCheck className="h-8 w-8" aria-hidden="true" />
				</span>
				<div>
					<p className="text-sm font-bold uppercase tracking-[0.18em] text-red-300">
						{app} onboarding
					</p>
					<h1 className="mt-1 text-2xl font-black">Install Signatura to approve</h1>
				</div>
			</div>

			<div className="mt-4 grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
				<p>
					Application: <span className="font-mono text-white">{app}</span>
				</p>
				<p>
					Requested Role:{' '}
					<span className="font-mono text-white">{requestedRole}</span>
				</p>
			</div>

			<div className="mt-6 grid gap-3">
				<button
					type="button"
					onClick={installApp}
					className="flex min-h-14 w-full items-center justify-center gap-3 rounded-lg bg-red-500 px-5 py-4 text-base font-bold text-white transition hover:bg-red-400">
					<Download className="h-5 w-5" />
					<span>Install Signatura PWA</span>
					<ArrowRight className="h-5 w-5" />
				</button>
				<button
					type="button"
					onClick={continueApproval}
					className="flex min-h-14 w-full items-center justify-center gap-3 rounded-lg border border-white/15 bg-white/5 px-5 py-4 text-base font-bold text-white transition hover:border-red-400/70 hover:bg-red-500/10">
					<ExternalLink className="h-5 w-5" />
					<span>{nextPath ? 'Create or Open Signatura ID' : 'Continue ACCURA Approval'}</span>
				</button>
				{approvalPath ? (
					<a
						href={approvalPath}
						className="break-all text-center text-xs font-semibold text-red-200 underline underline-offset-4">
						Open this approval link again
					</a>
				) : null}
			</div>

			{status ? (
				<p className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-200">
					{status}
				</p>
			) : null}
		</section>
	);
}
