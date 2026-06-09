import { Suspense } from 'react';
import Link from 'next/link';
import { SecurityNavLinks } from '@/components/SecurityNavLinks';

export default function SecurityLayout({ children }) {
	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(239,68,68,0.16),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-8">
			<nav className="mx-auto mb-8 flex max-w-6xl flex-col gap-4 text-white sm:flex-row sm:items-center sm:justify-between">
				<Link href="/" className="text-sm font-bold uppercase tracking-[0.18em]">
					Signatura
				</Link>
				<Suspense fallback={<div className="flex flex-wrap gap-2" />}>
					<SecurityNavLinks />
				</Suspense>
			</nav>
			{children}
		</main>
	);
}
