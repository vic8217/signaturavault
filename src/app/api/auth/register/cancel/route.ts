import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	assertSecureWebAuthnRequest,
	logSecurityEvent,
} from '@/lib/webauthn';

import { CANCELLABLE_REGISTRATION_STATUSES } from '@/lib/registration-status';

const CANCELLABLE_STATUSES = CANCELLABLE_REGISTRATION_STATUSES;

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json().catch(() => ({}));
		const registrationSessionId = String(body.registrationSessionId || '').trim();
		if (!registrationSessionId) {
			return jsonError('registrationSessionId is required', 400);
		}

		const session = await prisma.authChallenge.findFirst({
			where: {
				id: registrationSessionId,
				type: 'REGISTER_ACCOUNT',
				usedAt: null,
			},
		});
		if (!session) return Response.json({ ok: true, cancelled: false });

		const user = session.userId
			? await prisma.user.findUnique({ where: { id: session.userId } })
			: null;
		const activeTrustedDeviceCount = user
			? await prisma.trustedDevice.count({
					where: {
						userId: user.id,
						isTrusted: true,
						removedAt: null,
						status: 'active',
					},
				})
			: 0;

		await prisma.$transaction([
			prisma.authChallenge.updateMany({
				where: {
					userId: session.userId,
					type: { in: ['REGISTER_ACCOUNT', 'REGISTER_PASSKEY'] },
					usedAt: null,
				},
				data: { usedAt: new Date() },
			}),
			...(user && activeTrustedDeviceCount === 0
				? [
						prisma.user.updateMany({
							where: {
								id: user.id,
								accountStatus: { in: CANCELLABLE_STATUSES },
							},
							data: { accountStatus: 'cancelled' },
						}),
					]
				: []),
		]);

		if (user) {
			await logSecurityEvent(req, 'registration_cancelled', user.id, {
				registrationSessionId,
				activeTrustedDeviceCount,
			});
		}

		return Response.json({ ok: true, cancelled: true });
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to cancel registration'),
			400,
		);
	}
}
