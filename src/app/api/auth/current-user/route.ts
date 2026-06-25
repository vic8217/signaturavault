import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { requireSession } from '@/lib/session';

export async function GET() {
	try {
		const session = await requireSession();
		if (!session?.userId) {
			return jsonError('Not signed in', 401);
		}

		return Response.json({
			ok: true,
			user: {
				id: session.userId,
				signaturaId: session.signaturaId,
				role: session.role || null,
				trustLevel: session.trustLevel || 1,
				accountStatus: session.accountStatus || null,
			},
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to load current user'),
			400,
		);
	}
}
