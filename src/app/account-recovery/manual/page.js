import { ManualAccountRecoveryForm } from '@/components/ManualAccountRecoveryForm';
import { normalizeLoginNextPath } from '@/lib/portalRoutes';

export default async function ManualAccountRecoveryPage({ searchParams }) {
	const params = await searchParams;
	const signaturaId =
		typeof params?.signaturaId === 'string'
			? params.signaturaId
			: typeof params?.signatura_id === 'string'
				? params.signatura_id
				: '';
	const rawNext =
		typeof params?.next === 'string' && params.next.startsWith('/')
			? params.next
			: '';
	const returnPath = rawNext ? normalizeLoginNextPath(rawNext) : '';

	return (
		<ManualAccountRecoveryForm
			initialSignaturaId={signaturaId.trim().toUpperCase()}
			returnPath={returnPath}
		/>
	);
}
