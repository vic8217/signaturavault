import { AddPasskeyPanel } from '@/components/AddPasskeyPanel';

export default async function AddPasskeyPage({ searchParams }) {
	const params = await searchParams;
	const recovered = params?.recovered === '1';
	const nextPath =
		typeof params?.next === 'string' && params.next.startsWith('/')
			? params.next
			: '/wallet';

	return (
		<AddPasskeyPanel
			mode="passkey"
			approvalMethod={recovered ? 'recovery-code' : 'trusted-device'}
			nextPath={nextPath}
		/>
	);
}
