'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Download, ExternalLink, Smartphone, X } from 'lucide-react';

const DISMISSED_KEY = 'signatura.homePwaInstallAlert.dismissed';

function isStandaloneMode() {
	return (
		window.matchMedia('(display-mode: standalone)').matches ||
		window.navigator.standalone === true
	);
}

function isSmallDevice() {
	return (
		window.matchMedia('(max-width: 767px)').matches ||
		window.matchMedia('(pointer: coarse)').matches
	);
}

export function HomePwaInstallAlert() {
	const [visible, setVisible] = useState(false);
	const [deferredPrompt, setDeferredPrompt] = useState(null);
	const [status, setStatus] = useState('');

	useEffect(() => {
		if (isStandaloneMode() || !isSmallDevice()) {
			return undefined;
		}

		let dismissed = false;
		try {
			dismissed = window.localStorage.getItem(DISMISSED_KEY) === '1';
		} catch {
			dismissed = false;
		}

		if (!dismissed) {
			const timer = window.setTimeout(() => setVisible(true), 500);
			return () => window.clearTimeout(timer);
		}

		return undefined;
	}, []);

	useEffect(() => {
		function storeInstallPrompt(event) {
			event.preventDefault();
			window.__signaturaPwaInstallPrompt = event;
			setDeferredPrompt(event);
		}

		function handleCapturedInstallPrompt() {
			if (window.__signaturaPwaInstallPrompt) {
				setDeferredPrompt(window.__signaturaPwaInstallPrompt);
			}
		}

		function handleAppInstalled() {
			window.__signaturaPwaInstallPrompt = null;
			setDeferredPrompt(null);
			setVisible(false);
			try {
				window.localStorage.setItem(DISMISSED_KEY, '1');
			} catch {
				// Ignore storage failures; install state is enough for this session.
			}
		}

		handleCapturedInstallPrompt();
		window.addEventListener('beforeinstallprompt', storeInstallPrompt);
		window.addEventListener(
			'signatura:pwa-install-ready',
			handleCapturedInstallPrompt,
		);
		window.addEventListener('appinstalled', handleAppInstalled);

		return () => {
			window.removeEventListener('beforeinstallprompt', storeInstallPrompt);
			window.removeEventListener(
				'signatura:pwa-install-ready',
				handleCapturedInstallPrompt,
			);
			window.removeEventListener('appinstalled', handleAppInstalled);
		};
	}, []);

	function dismiss() {
		setVisible(false);
		try {
			window.localStorage.setItem(DISMISSED_KEY, '1');
		} catch {
			// A dismissed in-memory sheet is still fine when storage is unavailable.
		}
	}

	async function installApp() {
		const promptEvent = deferredPrompt || window.__signaturaPwaInstallPrompt;

		if (!promptEvent) {
			setStatus('Open the install page for browser-specific steps.');
			return;
		}

		promptEvent.prompt();
		const choice = await promptEvent.userChoice.catch(() => null);
		window.__signaturaPwaInstallPrompt = null;
		setDeferredPrompt(null);

		if (choice?.outcome === 'accepted') {
			setStatus('Installed. Open Signatura from your home screen to sign in.');
			try {
				window.localStorage.setItem(DISMISSED_KEY, '1');
			} catch {
				// Ignore storage failures after install.
			}
			return;
		}

		setStatus('Install dismissed. You can continue in the browser.');
	}

	if (!visible) return null;

	return (
		<div className="fixed inset-x-0 bottom-0 z-[90] px-3 pb-3 sm:hidden">
			<div
				className="mx-auto max-w-md rounded-lg border border-red-500/45 bg-slate-950 p-4 text-white shadow-[0_0_60px_rgba(239,68,68,0.32)]"
				role="dialog"
				aria-modal="true"
				aria-labelledby="home-pwa-install-title">
				<div className="flex items-start gap-3">
					<div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-red-500/45 bg-red-500/10">
						<Smartphone className="h-5 w-5 text-red-300" />
					</div>
					<div className="min-w-0 flex-1">
						<h2 id="home-pwa-install-title" className="text-base font-black">
							Install Signatura App
						</h2>
						<p className="mt-1 text-sm leading-5 text-slate-300">
							Add Signatura to your phone. Home-screen launches open directly to
							login.
						</p>
					</div>
					<button
						type="button"
						onClick={dismiss}
						className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 text-slate-300"
						aria-label="Dismiss install alert">
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
					<button
						type="button"
						onClick={installApp}
						className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-3 text-sm font-bold text-white">
						<Download className="h-4 w-4" />
						<span>Install App</span>
					</button>
					<Link
						href="/app"
						className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/15 px-4 text-slate-200"
						aria-label="Open install page">
						<ExternalLink className="h-4 w-4" />
					</Link>
				</div>

				{status ? (
					<p className="mt-3 text-center text-xs leading-5 text-slate-400">
						{status}
					</p>
				) : null}
			</div>
		</div>
	);
}
