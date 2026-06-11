import { loadDb } from '@/lib/db';
import { requireAdminRole } from '@/lib/admin-auth';
import { getAdminAnchoringSummary } from '@/lib/anchoring/batchService';

export async function GET() {
	const auth = await requireAdminRole();
	if (auth.error) return auth.error;

	const db = await loadDb();
	const summary = await getAdminAnchoringSummary(db);
	return Response.json(summary);
}
