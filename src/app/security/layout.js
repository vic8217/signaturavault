import Link from 'next/link';

const links = [
	['Devices', '/security/devices'],
	['Add Device', '/security/add-device'],
	['Add Passkey', '/security/add-passkey'],
	['Recovery Codes', '/security/recovery-codes'],
];

export default function SecurityLayout({ children }) {
	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(239,68,68,0.16),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-8">
			<nav className="mx-auto mb-8 flex max-w-6xl flex-col gap-4 text-white sm:flex-row sm:items-center sm:justify-between">
				<Link href="/" className="text-sm font-bold uppercase tracking-[0.18em]">
					Signatura
				</Link>
				<div className="flex flex-wrap gap-2">
					{links.map(([label, href]) => (
						<Link
							key={href}
							href={href}
							className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-red-400 hover:text-red-300">
							{label}
						</Link>
					))}
				</div>
			</nav>
			{children}
		</main>
	);
}
