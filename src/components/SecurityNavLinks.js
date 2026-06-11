'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

const links = [
	['Devices', '/signatura/trusted-devices'],
	['Add Device', '/signatura/trusted-devices/add'],
	['Add Passkey', '/signatura/trusted-devices/add-passkey'],
	['Recovery Codes', '/signatura/settings/recovery-codes'],
];

function hrefWithNext(href, nextPath) {
	if (!nextPath) return href;
	return href + '?next=' + encodeURIComponent(nextPath);
}

export function SecurityNavLinks() {
	const searchParams = useSearchParams();
	const requestedNext = searchParams.get('next') || '';
	const nextPath = requestedNext.startsWith('/') ? requestedNext : '';

	return (
		<div className="flex flex-wrap gap-2">
			{links.map(([label, href]) => (
				<Link
					key={href}
					href={hrefWithNext(href, nextPath)}
					className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-red-400 hover:text-red-300">
					{label}
				</Link>
			))}
		</div>
	);
}
