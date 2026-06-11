import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { createAuthenticatedLoginResponse } from '@/lib/auth/loginSession';
import { consumeTrustedDeviceLoginChallenge } from '@/lib/trustedDeviceLoginChallenge';

export async function POST(req) {
	try {
		const body = await req.json().catch(() => ({}));
		const challengeId = String(body.challengeId ?? '').trim();
		const browserSecret = String(body.browserSecret ?? '').trim();
		const approvalToken = String(body.approvalToken ?? '').trim();
		if (!challengeId || !browserSecret || !approvalToken) {
			return jsonError(
				'Challenge id, browser secret, and approval token are required',
				400,
			);
		}

		const { user, nextPath, approvingCredentialId } =
			await consumeTrustedDeviceLoginChallenge({
				challengeId,
				browserSecret,
				approvalToken,
			});

		return createAuthenticatedLoginResponse({
			req,
			user,
			nextPath,
			eventName: 'remote_login_succeeded',
			eventDetails: {
				challengeId,
				approvingCredentialId,
			},
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to finish trusted device login'),
			error.status ?? 400,
		);
	}
}
