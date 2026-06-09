import { withDb } from '@/lib/db';
import { requireAdminRole } from '@/lib/admin-auth';
import { createAndPublishMerkleBatch } from '@/lib/anchoring/batchService';

export async function POST(req) {
	const auth = await requireAdminRole();
	if (auth.error) return auth.error;

	const body = await req.json().catch(() => ({}));
	return withDb(async (db) => {
		try {
			const batch = await createAndPublishMerkleBatch(db, {
				limit: Number(body.limit || process.env.ANCHOR_BATCH_SIZE || 100),
				publishMethod: body.publishMethod || process.env.ANCHOR_PUBLISH_METHOD,
			});
			if (!batch) {
				return Response.json({ message: 'No pending anchors to batch' });
			}
			return Response.json({ batch });
		} catch (error) {
			return Response.json(
				{ error: error instanceof Error ? error.message : 'Unable to publish batch' },
				{ status: 500 },
			);
		}
	});
}
