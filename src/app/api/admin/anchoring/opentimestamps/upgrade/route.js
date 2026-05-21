import { withDb } from '@/lib/db';
import { requireAdminRole } from '@/lib/admin-auth';
import { upgradePendingOpenTimestampsBatches } from '@/lib/anchoring/batchService';

async function authorize(req) {
	const cronSecret = process.env.ANCHOR_CRON_SECRET;
	const bearer = req.headers.get('authorization') || '';
	if (cronSecret && bearer === `Bearer ${cronSecret}`) {
		return {};
	}
	return requireAdminRole();
}

export async function POST(req) {
	const auth = await authorize(req);
	if (auth.error) return auth.error;

	return withDb(async (db) => {
		const results = await upgradePendingOpenTimestampsBatches(db);
		return Response.json({
			upgraded: results.filter((result) => result.status === 'published').length,
			checked: results.length,
			results,
		});
	});
}
