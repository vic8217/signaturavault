import { AddPasskeyPanel } from '@/components/AddPasskeyPanel';
import { normalizeLoginNextPath } from '@/lib/portalRoutes';

export default async function AddPasskeyPage({ searchParams }) {
	const params = await searchParams;
	const recovered = params?.recovered === '1';
	const nextPath = normalizeLoginNextPath(
		typeof params?.next === 'string' && params.next.startsWith('/')
			? params.next
			: '/signatura/dashboard',
	);

	return (
		<AddPasskeyPanel
			mode="passkey"
			approvalMethod={recovered ? 'recovery-code' : 'trusted-device'}
			nextPath={nextPath}
		/>
	);
}
