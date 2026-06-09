import { DevicesPanel } from '@/components/DevicesPanel';

export default async function TrustedDevicesPage({ searchParams }) {
	const params = await searchParams;
	const requestedNext = params?.next || '';
	const returnPath =
		typeof requestedNext === 'string' && requestedNext.startsWith('/')
			? requestedNext
			: '';

	return <DevicesPanel returnPath={returnPath} />;
}
