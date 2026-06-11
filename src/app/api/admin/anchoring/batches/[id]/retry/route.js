import { loadDb } from '@/lib/db';
import { requireAdminRole } from '@/lib/admin-auth';
import { retryMerkleBatchPublish } from '@/lib/anchoring/batchService';

export async function POST(req, { params }) {
	const auth = await requireAdminRole();
	if (auth.error) return auth.error;

	const { id } = await params;
	const body = await req.json().catch(() => ({}));

	try {
		const db = await loadDb();
		const batch = await retryMerkleBatchPublish(id, db, {
			publishMethod: body.publishMethod,
		});
		return Response.json({ batch });
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : 'Unable to retry batch' },
			{ status: 500 },
		);
	}
}
