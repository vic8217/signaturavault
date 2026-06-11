import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { pollTrustedDeviceLoginChallenge } from '@/lib/trustedDeviceLoginChallenge';

export async function POST(req) {
	try {
		const body = await req.json().catch(() => ({}));
		const challengeId = String(body.challengeId ?? '').trim();
		const browserSecret = String(body.browserSecret ?? '').trim();
		if (!challengeId || !browserSecret) {
			return jsonError('Challenge id and browser secret are required', 400);
		}

		const result = await pollTrustedDeviceLoginChallenge({
			challengeId,
			browserSecret,
		});

		return Response.json({ ok: true, ...result });
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to poll login challenge'),
			error.status ?? 400,
		);
	}
}
