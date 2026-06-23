import { jsonError } from '@/lib/api';
import { logAuthAudit } from '@/lib/auth/authAudit';
import { normalizeChallengeId } from '@/lib/accuraQrLogin';
import { requireSession } from '@/lib/session';

const ALLOWED_EVENTS = new Set([
	'accura_qr_scanned',
	'accura_qr_wrong_app',
	'accura_qr_expired_attempt',
	'accura_qr_invalid_attempt',
]);

export async function POST(req) {
	const session = await requireSession();
	if (!session?.userId) return jsonError('Authentication required', 401);
	const body = await req.json().catch(() => ({}));
	const event = String(body.event || '').trim();
	if (!ALLOWED_EVENTS.has(event)) return jsonError('Unsupported audit event', 400);

	await logAuthAudit(req, event, {
		userId: session.userId,
		result: event.includes('wrong') || event.includes('invalid') ? 'denied' : 'success',
		details: {
			challengeId: normalizeChallengeId(body.challengeId),
			reason: String(body.reason || '').trim().slice(0, 120),
		},
	});
	return Response.json({ ok: true });
}
