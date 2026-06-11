import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { fetchHavenUnlockChallenge } from '@/lib/havenRemoteUnlock';

export async function GET(req) {
	try {
		const url = new URL(req.url);
		const challengeId = String(url.searchParams.get('cid') ?? '').trim();
		const shortCode = String(url.searchParams.get('code') ?? '').trim().toUpperCase();
		if (!challengeId || !shortCode) {
			return jsonError('Challenge id and code are required', 400);
		}

		const challenge = await fetchHavenUnlockChallenge({ challengeId, shortCode });
		return Response.json({ ok: true, challenge });
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to look up unlock challenge'),
			error.status ?? 400,
		);
	}
}
