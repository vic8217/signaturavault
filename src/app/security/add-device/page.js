import { AddPasskeyPanel } from '@/components/AddPasskeyPanel';

export default async function AddDevicePage({ searchParams }) {
	const params = await searchParams;
	const requestedNext = params?.next || '';
	const nextPath =
		typeof requestedNext === 'string' && requestedNext.startsWith('/')
			? requestedNext
			: '/wallet';

	return <AddPasskeyPanel mode="device" nextPath={nextPath} />;
}
