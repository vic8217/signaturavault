import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { userPublicIdentity } from '@/lib/identity';
import {
	CANCELLABLE_REGISTRATION_STATUSES,
	PENDING_REGISTRATION_STATUSES,
	REGISTRATION_STATUSES,
	currentRegistrationStep,
	registrationStatusCardState,
} from '@/lib/registration-status';
import {
	assertSecureWebAuthnRequest,
	logSecurityEvent,
} from '@/lib/webauthn';

async function loadRegistrationSummaries(userId: string, currentStep: string) {
	const passkeySummary = await (async () => {
		const credential = await prisma.webAuthnCredential.findFirst({
			where: {
				userId,
				...(currentStep === REGISTRATION_STATUSES.PASSKEY_CREATED
					? { isTrusted: false }
					: {}),
			},
			orderBy: { createdAt: 'desc' },
		});
		if (!credential) return null;
		return {
			passkeyStatus: 'Active',
			credentialRegistered: true,
			deviceName: credential.deviceName || 'This device',
			transports: credential.transports || [],
			userAgent: credential.userAgent || null,
		};
	})();

	const trustedDeviceSummary = await (async () => {
		const trustedDevice = await prisma.trustedDevice.findFirst({
			where: {
				userId,
				removedAt: null,
				isTrusted: true,
			},
			orderBy: { createdAt: 'desc' },
		});
		if (!trustedDevice) return null;
		return {
			deviceName: trustedDevice.deviceName || 'Trusted device',
			deviceStatus: 'Trusted',
			passkeyStatus: 'Active',
			userAgent: trustedDevice.userAgent || null,
		};
	})();

	const recoveryPhraseIssued = await prisma.recoveryCode.count({
		where: { userId },
	});

	return {
		passkeySummary,
		trustedDeviceSummary,
		recoveryPhraseAlreadyIssued: recoveryPhraseIssued > 0,
		statusCard: registrationStatusCardState(currentStep),
	};
}

export async function GET(
	req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	try {
		assertSecureWebAuthnRequest(req);
		const { id } = await params;
		const registrationSessionId = String(id || '').trim();
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
		if (!session) return jsonError('Registration session not found', 404);

		const user = await prisma.user.findUnique({
			where: { id: session.userId || '' },
		});
		if (!user) return jsonError('Registration account not found', 404);

		if (session.expiresAt <= new Date()) {
			await prisma.user.updateMany({
				where: {
					id: user.id,
					accountStatus: {
						in: Array.from(PENDING_REGISTRATION_STATUSES).filter(
							(status) =>
								status !== REGISTRATION_STATUSES.EXPIRED &&
								status !== REGISTRATION_STATUSES.CANCELLED,
						),
					},
				},
				data: { accountStatus: REGISTRATION_STATUSES.EXPIRED },
			});
			return Response.json({
				active: false,
				currentStep: REGISTRATION_STATUSES.EXPIRED,
				reason: 'expired',
			});
		}

		const currentStep = currentRegistrationStep(user);
		const summaries = await loadRegistrationSummaries(user.id, currentStep);

		await logSecurityEvent(req, 'registration_session_resumed', user.id, {
			registrationSessionId,
			currentStep,
			plaintextStored: false,
		});

		return Response.json({
			active: currentStep !== REGISTRATION_STATUSES.COMPLETED,
			registrationSessionId,
			currentStep,
			expiresAt: session.expiresAt,
			user: userPublicIdentity(user),
			...summaries,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to load registration session'),
			400,
		);
	}
}

export {
	CANCELLABLE_REGISTRATION_STATUSES,
	PENDING_REGISTRATION_STATUSES,
	REGISTRATION_STATUSES,
};
