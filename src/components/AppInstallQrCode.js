'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import {
	ArrowRight,
	CheckCircle2,
	ExternalLink,
	LockKeyhole,
	QrCode,
	ShieldCheck,
} from 'lucide-react';

function InstallTrustBadges() {
	return (
		<div className="mt-5 grid grid-cols-3 gap-2 border-y border-white/10 py-4">
			<div className="text-center">
				<ShieldCheck className="mx-auto h-5 w-5 text-red-400" />
				<p className="mt-2 text-[10px] font-semibold leading-tight text-slate-200 sm:text-xs">
					Zero Trust Level 2
				</p>
			</div>
			<div className="text-center">
				<LockKeyhole className="mx-auto h-5 w-5 text-red-400" />
				<p className="mt-2 text-[10px] font-semibold leading-tight text-slate-200 sm:text-xs">
					Encrypted &amp; Secure
				</p>
			</div>
			<div className="text-center">
				<CheckCircle2 className="mx-auto h-5 w-5 text-red-400" />
				<p className="mt-2 text-[10px] font-semibold leading-tight text-slate-200 sm:text-xs">
					Verified at the Source
				</p>
			</div>
		</div>
	);
}

function InstallSteps() {
	return (
		<>
			<ol className="mt-4 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-center text-[11px] font-semibold text-slate-200 sm:text-xs">
				<li className="grid justify-items-center gap-1.5">
					<span className="grid h-7 w-7 place-items-center rounded-full border border-red-400/60 bg-red-500/15 text-xs font-black text-red-200">
						1
					</span>
					<span>Scan QR</span>
				</li>
				<li aria-hidden="true" className="text-red-400/70">
					→
				</li>
				<li className="grid justify-items-center gap-1.5">
					<span className="grid h-7 w-7 place-items-center rounded-full border border-red-400/60 bg-red-500/15 text-xs font-black text-red-200">
						2
					</span>
					<span>Install App</span>
				</li>
				<li aria-hidden="true" className="text-red-400/70">
					→
				</li>
				<li className="grid justify-items-center gap-1.5">
					<span className="grid h-7 w-7 place-items-center rounded-full border border-red-400/60 bg-red-500/15 text-xs font-black text-red-200">
						3
					</span>
					<span>Open &amp; Login</span>
				</li>
			</ol>
			<div className="mt-4 text-center">
				<p className="inline-flex items-center gap-2 text-sm font-semibold text-white">
					<ShieldCheck className="h-4 w-4 text-red-400" />
					No App Store Required
				</p>
				<p className="mt-1 text-xs text-slate-400">Works on Android and iPhone</p>
			</div>
		</>
	);
}

export function AppInstallQrCode({
	embedded = false,
	hideInstallUrl = false,
	showInstallDetails = false,
}) {
	const [qrCode, setQrCode] = useState('');
	const [installUrl, setInstallUrl] = useState('/app');

	useEffect(() => {
		let isMounted = true;
		const configuredPublicUrl = String(
			process.env.NEXT_PUBLIC_SIGNATURA_PUBLIC_URL || '',
		).trim();
		const baseOrigin =
			configuredPublicUrl ||
			(typeof window !== 'undefined' ? window.location.origin : '');
		const url = new URL('/app', baseOrigin.endsWith('/') ? baseOrigin : `${baseOrigin}/`).toString();

		import('qrcode')
			.then((module) => {
				const qr = module.default ?? module;

				return qr.toDataURL(url, {
					errorCorrectionLevel: 'M',
					margin: 1,
					width: 256,
					color: {
						dark: '#020817',
						light: '#ffffff',
					},
				});
			})
			.then((dataUrl) => {
				if (isMounted) {
					setInstallUrl(url);
					setQrCode(dataUrl);
				}
			})
			.catch(() => {
				if (isMounted) {
					setInstallUrl(url);
					setQrCode('');
				}
			});

		return () => {
			isMounted = false;
		};
	}, []);

	return (
		<div
			className={
				embedded
					? ''
					: 'rounded-lg border border-white/10 bg-slate-950/90 p-4 shadow-[0_0_60px_rgba(239,68,68,0.18)]'
			}>
			<div className="relative mx-auto grid aspect-square w-full max-w-[220px] min-w-48 place-items-center rounded-lg bg-white p-3 shadow-[0_0_30px_rgba(239,68,68,0.22)]">
				{qrCode ? (
					<Image
						src={qrCode}
						alt="QR code for Signatura app install page"
						width={256}
						height={256}
						unoptimized
						className="h-full w-full object-contain"
					/>
				) : (
					<QrCode className="h-28 w-28 text-slate-900" strokeWidth={1.5} />
				)}
			</div>
			{showInstallDetails ? (
				<>
					<InstallTrustBadges />
					<InstallSteps />
				</>
			) : null}
			<Link
				href="/app"
				className="mt-4 flex min-h-11 items-center justify-between gap-2 rounded-lg bg-red-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-400">
				<span className="inline-flex items-center gap-2">
					<ExternalLink className="h-4 w-4" />
					Open install page
				</span>
				<ArrowRight className="h-4 w-4" />
			</Link>
			{hideInstallUrl ? null : (
				<p className="mt-3 break-all text-center text-xs leading-5 text-slate-400">
					{installUrl}
				</p>
			)}
		</div>
	);
}
