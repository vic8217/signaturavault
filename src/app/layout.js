import { Geist, Geist_Mono } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin'],
});

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin'],
});

export const metadata = {
	title: 'Signatura - Trust Every Document',
	description:
		'Zero Trust Level 2 digital document issuance, verification, and blockchain anchoring platform.',
	manifest: '/manifest.json',
	icons: {
		icon: '/icons/icon-192.png',
		apple: '/icons/icon-192.png',
	},
	appleWebApp: {
		capable: true,
		statusBarStyle: 'black-translucent',
		title: 'Signatura',
	},
};

export const viewport = {
	themeColor: '#020817',
	width: 'device-width',
	initialScale: 1,
	maximumScale: 1,
	userScalable: false,
};

export default function RootLayout({ children }) {
	return (
		<html
			lang="en"
			className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
			<head>
				<Script id="signatura-pwa-install-capture" strategy="beforeInteractive">
					{`
						window.addEventListener('beforeinstallprompt', function (event) {
							event.preventDefault();
							window.__signaturaPwaInstallPrompt = event;
							window.dispatchEvent(new Event('signatura:pwa-install-ready'));
						});

						window.addEventListener('appinstalled', function () {
							window.__signaturaPwaInstallPrompt = null;
						});
					`}
				</Script>
				<link rel="manifest" href="/manifest.json" />
				<link rel="apple-touch-icon" href="/icons/icon-192.png" />
				<meta name="theme-color" content="#020817" />
				<meta name="mobile-web-app-capable" content="yes" />
				<meta name="apple-mobile-web-app-capable" content="yes" />
				<meta
					name="apple-mobile-web-app-status-bar-style"
					content="black-translucent"
				/>
				<meta name="apple-mobile-web-app-title" content="Signatura" />
			</head>
			<body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
				<ServiceWorkerRegister />
				{children}
			</body>
		</html>
	);
}
