import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { userPublicIdentity } from '@/lib/identity';
import {
	hashRecoveryPhrase,
	makeRecoveryPhrase,
} from '@/lib/auth/recoveryPhrase';
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
			REGISTRATION_STATUSES.TRUSTED_DEVICE_REGISTERED,
			REGISTRATION_STATUSES.PENDING_RECOVERY_PHRASE,
			REGISTRATION_STATUSES.PENDING_ACTIVATION,
		]);
		if (!allowedStatuses.has(user.accountStatus)) {
			return jsonError(
				'Trusted device must be registered before recovery phrase setup',
				409,
			);
		}

		const existingRecoveryCode = await prisma.recoveryCode.findFirst({
			where: { userId },
			orderBy: { createdAt: 'desc' },
		});
		if (existingRecoveryCode) {
			return Response.json({
				ok: true,
				user: userPublicIdentity(user),
				currentStep: user.accountStatus,
				recoveryPhraseAlreadyIssued: true,
			});
		}

		const recoveryPhrase = makeRecoveryPhrase();

		const updatedUser = await prisma.$transaction(async (tx) => {
			await tx.recoveryCode.create({
				data: {
					id: crypto.randomUUID(),
					userId,
					codeHash: hashRecoveryPhrase(recoveryPhrase),
					codePrefix: 'phrase',
				},
			});

			return tx.user.update({
				where: { id: userId },
				data: {
					accountStatus: REGISTRATION_STATUSES.PENDING_RECOVERY_PHRASE,
				},
			});
		});

		await logSecurityEvent(req, 'recovery_phrase_issued', userId, {
			registrationSessionId,
			notice: 'Recovery phrase shown once during onboarding',
		});

		return Response.json({
			ok: true,
			user: userPublicIdentity(updatedUser),
			currentStep: REGISTRATION_STATUSES.PENDING_RECOVERY_PHRASE,
			recoveryPhrase,
			recoveryPhraseAlreadyIssued: false,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to issue recovery phrase'),
			400,
		);
	}
}
