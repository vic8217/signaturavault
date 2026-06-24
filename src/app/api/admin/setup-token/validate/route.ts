import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	adminSetupPublicUser,
	validateAdminSetupToken,
} from '@/lib/adminSetupToken';

export async function POST(req: Request) {
	try {
		const body = await req.json().catch(() => ({}));
		const token = String(body.token || '').trim();
		const result = await validateAdminSetupToken(req, token, {
			auditEvent: 'admin_setup_token_viewed',
		});
		if (!result.ok) return jsonError(result.message, result.status);

		return Response.json({
			ok: true,
			user: adminSetupPublicUser(result.record.user),
			expiresAt: result.record.expiresAt.toISOString(),
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to validate setup link'),
			400,
		);
	}
}
