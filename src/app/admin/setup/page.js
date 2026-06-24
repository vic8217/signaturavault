import Link from 'next/link';
import { AdminSetupPasskeyForm } from '@/components/AdminSetupPasskeyForm';

export const metadata = {
	title: 'Admin Setup | Signatura',
	description: 'Create a Signatura admin passkey from a one-time setup link.',
};

function queryValue(params, key) {
	const value = params?.[key];
	if (Array.isArray(value)) return value[0] || '';
	return typeof value === 'string' ? value : '';
}

export default async function AdminSetupPage({ searchParams }) {
	const params = await searchParams;
	const token = queryValue(params, 'token');

	return (
		<main className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(239,68,68,0.18),transparent_30%),linear-gradient(180deg,#020617,#071224)] px-4 py-10">
			<div className="mx-auto mb-8 flex max-w-xl items-center justify-between text-white">
				<Link href="/" className="text-sm font-bold uppercase tracking-[0.18em]">
					Signatura
				</Link>
				<Link
					href="/admin/login?next=/admin"
					className="text-sm font-semibold text-red-200">
					Admin sign-in
				</Link>
			</div>
			<AdminSetupPasskeyForm token={token} />
		</main>
	);
}
