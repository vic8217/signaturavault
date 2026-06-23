import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { logAuthAudit } from '@/lib/auth/authAudit';
import {
	ACCURA_QR_APP,
	normalizeChallengeId,
	normalizeShortCode,
} from '@/lib/accuraQrLogin';
import { postAccuraQrLoginApproval } from '@/lib/accuraQrLoginService';
import { requireSession } from '@/lib/session';

export async function POST(req) {
	try {
		const session = await requireSession();
		if (!session?.userId) return jsonError('Authentication required', 401);
		const body = await req.json().catch(() => ({}));
		const challengeId = normalizeChallengeId(body.challengeId);
		const shortCode = normalizeShortCode(body.shortCode);
		if (!challengeId || !shortCode) {
			return jsonError('Challenge ID and short code are required', 400);
		}

		await postAccuraQrLoginApproval({
			app: ACCURA_QR_APP,
			challengeId,
			shortCode,
			status: 'CANCELLED',
			cancelledAt: new Date().toISOString(),
		});
		await logAuthAudit(req, 'accura_qr_login_cancelled', {
			userId: session.userId,
			details: { challengeId },
		});
		return Response.json({ ok: true, status: 'CANCELLED' });
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to cancel ACCURA login'),
			error.status ?? 400,
		);
	}
}
