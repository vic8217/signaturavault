import { AddPasskeyPanel } from '@/components/AddPasskeyPanel';
import { normalizeLoginNextPath } from '@/lib/portalRoutes';

export default async function AddDevicePage({ searchParams }) {
	const params = await searchParams;
	const requestedNext = params?.next || '';
	const nextPath = normalizeLoginNextPath(
		typeof requestedNext === 'string' && requestedNext.startsWith('/')
			? requestedNext
			: '/signatura/dashboard',
	);

	return <AddPasskeyPanel mode="device" nextPath={nextPath} />;
}
