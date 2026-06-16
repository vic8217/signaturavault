import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { userPublicIdentity } from '@/lib/identity';
import { REGISTRATION_STATUSES } from '@/lib/registration-status';
import {
	assertSecureWebAuthnRequest,
	logSecurityEvent,
} from '@/lib/webauthn';

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json().catch(() => ({}));
		const userId = String(body.userId || '').trim();
		const registrationSessionId = String(body.registrationSessionId || '').trim();

		if (!userId || !registrationSessionId) {
			return jsonError('userId and registrationSessionId are required', 400);
		}

		const session = await prisma.authChallenge.findFirst({
			where: {
				id: registrationSessionId,
				userId,
				type: 'REGISTER_ACCOUNT',
				usedAt: null,
				expiresAt: { gt: new Date() },
			},
		});
		if (!session) {
			return jsonError('Registration session not found or expired', 404);
		}

		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user) return jsonError('Account not found', 404);

		const allowedStatuses = new Set([
			REGISTRATION_STATUSES.PENDING_RECOVERY_PHRASE,
			REGISTRATION_STATUSES.PENDING_ACTIVATION,
		]);
		if (!allowedStatuses.has(user.accountStatus)) {
			return jsonError('Recovery phrase must be saved before activation', 409);
		}

		const recoveryCode = await prisma.recoveryCode.findFirst({
			where: { userId },
		});
		if (!recoveryCode) {
			return jsonError('Recovery phrase has not been issued for this account', 409);
		}

		const trustedDeviceCount = await prisma.trustedDevice.count({
			where: {
				userId,
				isTrusted: true,
				removedAt: null,
				status: 'active',
			},
		});
		if (trustedDeviceCount === 0) {
			return jsonError('Trusted device registration is required before activation', 409);
		}

		const updatedUser = await prisma.$transaction(async (tx) => {
			const activatedUser = await tx.user.update({
				where: { id: userId },
				data: {
					accountStatus: 'active',
					trustLevel: 2,
				},
			});

			await tx.authChallenge.updateMany({
				where: {
					userId,
					type: 'REGISTER_ACCOUNT',
					usedAt: null,
				},
				data: { usedAt: new Date() },
			});

			await tx.securityEventLog.create({
				data: {
					id: crypto.randomUUID(),
					userId,
					event: 'account_activated',
					details: {
						trustLevel: 2,
						notice: 'Registration completed; user redirected to login',
					},
				},
			});

			return activatedUser;
		});

		await logSecurityEvent(req, 'account_activated', userId, {
			registrationSessionId,
			trustLevel: 2,
		});

		return Response.json({
			ok: true,
			user: userPublicIdentity(updatedUser),
			currentStep: REGISTRATION_STATUSES.COMPLETED,
			redirectTo: '/login',
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to activate account'),
			400,
		);
	}
}
