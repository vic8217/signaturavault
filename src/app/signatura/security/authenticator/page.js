import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { requireSession } from '@/lib/session';
import { AuthenticatorDashboard } from '@/components/AuthenticatorDashboard';

export default async function AuthenticatorPage() {
	const session = await requireSession();
	if (!session) redirect('/login');
	return <Suspense fallback={<p className="text-sm text-slate-300">Loading Authenticator…</p>}><AuthenticatorDashboard signaturaId={session.signaturaId} /></Suspense>;
}
