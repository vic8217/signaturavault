import { withDb } from '@/lib/db';
import { requireAdminRole } from '@/lib/admin-auth';
import { publishMerkleBatch } from '@/lib/anchoring/batchService';

export async function POST(req, { params }) {
	const auth = await requireAdminRole();
	if (auth.error) return auth.error;

	const { id } = await params;
	const body = await req.json().catch(() => ({}));

	return withDb(async (db) => {
		try {
			const batch = await publishMerkleBatch(db, id, {
				publishMethod: body.publishMethod,
			});
			return Response.json({ batch });
		} catch (error) {
			return Response.json(
				{ error: error instanceof Error ? error.message : 'Unable to retry batch' },
				{ status: 500 },
			);
		}
	});
}
