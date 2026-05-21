import Link from 'next/link';

export default function IssuerLayout({ children }) {
	return (
		<div className="min-h-screen bg-linear-to-b from-slate-50 to-slate-100">
			<div className="border-b border-slate-200 bg-white shadow-sm">
				<div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
					<div>
						<Link
							href="/"
							className="text-sm font-semibold uppercase tracking-[0.3em] text-red-600 hover:text-red-700">
							← Back to Home
						</Link>
						<h1 className="text-2xl font-bold text-slate-900">Issuer Portal</h1>
					</div>
					<nav className="flex flex-wrap gap-3 text-sm font-medium text-slate-700">
						<Link
							className="rounded-lg border border-slate-200 bg-white px-4 py-2 transition hover:bg-slate-50 hover:border-red-300"
							href="/issuer">
							Dashboard
						</Link>
						<Link
							className="rounded-lg border border-slate-200 bg-white px-4 py-2 transition hover:bg-slate-50 hover:border-red-300"
							href="/issuer/api">
							API
						</Link>
						<Link
							className="rounded-lg border border-slate-200 bg-white px-4 py-2 transition hover:bg-slate-50 hover:border-red-300"
							href="/issuer/audit">
							Audit
						</Link>
						<Link
							className="rounded-lg bg-red-500 text-white px-4 py-2 transition hover:bg-red-600"
							href="/">
							Sign Out
						</Link>
					</nav>
				</div>
			</div>
			<main className="w-full px-6 py-10">{children}</main>
		</div>
	);
}
