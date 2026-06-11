import { Geist, Geist_Mono } from 'next/font/google';
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
		icon: '/signatura-icon-192.png',
		apple: '/signatura-icon-192.png',
	},
	appleWebApp: {
		capable: true,
		statusBarStyle: 'black-translucent',
		title: 'Signatura',
	},
};

export const viewport = {
	themeColor: '#0F172A',
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
				<link rel="manifest" href="/manifest.json" />
				<link rel="apple-touch-icon" href="/signatura-icon-192.png" />
				<meta name="theme-color" content="#0F172A" />
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
