import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { lookupTrustedDeviceLoginChallenge } from '@/lib/trustedDeviceLoginChallenge';

export async function GET(req) {
	try {
		const url = new URL(req.url);
		const challengeId = String(url.searchParams.get('cid') ?? '').trim();
		const shortCode = String(url.searchParams.get('code') ?? '')
			.trim()
			.toUpperCase();
		if (!challengeId || !shortCode) {
			return jsonError('Challenge id and code are required', 400);
		}

		const challenge = await lookupTrustedDeviceLoginChallenge({
			challengeId,
			shortCode,
		});
		if (!challenge) {
			return jsonError('Login challenge not found or expired', 404);
		}

		return Response.json({ ok: true, challenge });
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to look up login challenge'),
			error.status ?? 400,
		);
	}
}
