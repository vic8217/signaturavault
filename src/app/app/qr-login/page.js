import { PwaQrLoginGate } from '@/components/PwaQrLoginGate';
import { buildRemoteApprovePath, queryValue } from '@/lib/remoteApprove';

export const metadata = {
	title: 'Open Signatura App',
	description: 'Open Signatura to approve a trusted-device login.',
};

export default async function AppQrLoginPage({ searchParams }) {
	const params = await searchParams;
	const challengeId = queryValue(params, 'cid') || queryValue(params, 'challengeId');
	const shortCode = queryValue(params, 'code') || queryValue(params, 'shortCode');
	const signaturaId = queryValue(params, 'signaturaId');
	const scannerPath = '/app/scan';
	const approvalPath =
		challengeId && shortCode
			? buildRemoteApprovePath({ challengeId, shortCode, signaturaId })
			: scannerPath;

	return (
		<PwaQrLoginGate
			approvalPath={approvalPath}
			scannerPath={scannerPath}
			signaturaId={signaturaId}
			shortCode={shortCode}
		/>
	);
}
