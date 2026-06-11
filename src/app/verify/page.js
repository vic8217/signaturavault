import { Suspense } from 'react';
import { VerifyDocumentPanel } from '@/components/VerifyDocumentPanel';

export const metadata = {
	title: 'Verify Document | Signatura',
};

function VerifyFallback() {
	return (
		<div className="min-h-screen bg-linear-to-b from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-center px-6">
			<p className="text-sm text-slate-300">Loading verification…</p>
		</div>
	);
}

export default function VerifyDocumentPage() {
	return (
		<Suspense fallback={<VerifyFallback />}>
			<VerifyDocumentPanel />
		</Suspense>
	);
}
