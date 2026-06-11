import { IssuerRequestsPanel } from '@/components/IssuerRequestsPanel';

export const metadata = {
	title: 'Document Requests | Issuer Portal',
};

export default function IssuerRequestsPage() {
	return (
		<div className="space-y-6">
			<header>
				<p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-400">
					Request inbox
				</p>
				<h1 className="mt-2 text-3xl font-bold text-white">Owner document requests</h1>
				<p className="mt-2 max-w-3xl text-sm text-slate-400">
					Review encrypted owner submissions, approve or deny requests, and mark approved
					requests as issued when your document workflow is complete.
				</p>
			</header>
			<IssuerRequestsPanel />
		</div>
	);
}
