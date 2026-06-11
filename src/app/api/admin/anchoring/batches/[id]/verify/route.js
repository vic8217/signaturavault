import { loadDb } from '@/lib/db';
import { requireAdminRole } from '@/lib/admin-auth';
import { verifyMerkleBatchProofs } from '@/lib/anchoring/batchService';

export async function POST(_req, { params }) {
	const auth = await requireAdminRole();
	if (auth.error) return auth.error;

	const { id } = await params;
	const db = await loadDb();
	const result = await verifyMerkleBatchProofs(id, db);

	if (result.error) {
		return Response.json({ error: result.error }, { status: result.status || 404 });
	}

	return Response.json(result.body);
}
