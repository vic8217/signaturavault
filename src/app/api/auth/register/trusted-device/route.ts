import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { userPublicIdentity } from '@/lib/identity';
import { logAuthAudit } from '@/lib/auth/authAudit';
import { REGISTRATION_STATUSES } from '@/lib/registration-status';
import {
	normalizeDeviceBindingSecret,
	trustedDeviceBindingHash,
} from '@/lib/trustedDeviceBinding';
import {
	findRegistrationSession,
	touchRegistrationSession,
} from '@/lib/registration-session';
import {
	assertSecureWebAuthnRequest,
	getUserAgent,
	logSecurityEvent,
} from '@/lib/webauthn';

function trustedDeviceSuccessResponse(user: any, trustedDevice: any) {
	return Response.json({
		ok: true,
		user: userPublicIdentity(user),
		currentStep: REGISTRATION_STATUSES.TRUSTED_DEVICE_REGISTERED,
		trustedDeviceSummary: {
			deviceName: trustedDevice.deviceName || 'Trusted device',
			deviceStatus: 'Trusted',
			passkeyStatus: 'Active',
			userAgent: trustedDevice.userAgent || null,
		},
	});
}

function signaturaAppLinkModel(client = prisma) {
	return (
		client as unknown as {
			signaturaAppLink?: {
				updateMany: (args: {
					where: Record<string, unknown>;
					data: Record<string, unknown>;
				}) => Promise<unknown>;
			};
		}
	).signaturaAppLink;
}

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json().catch(() => ({}));
		const userId = String(body.userId || '').trim();
		const registrationSessionId = String(body.registrationSessionId || '').trim();
		const deviceName = String(body.deviceName || '').trim() || 'Trusted device';
		const deviceBindingSecret = normalizeDeviceBindingSecret(
			body.deviceBindingSecret,
		);

		if (!userId) {
			return jsonError('userId is required', 400);
		}
		if (!deviceBindingSecret) {
			return jsonError('Trusted device binding secret is required', 400);
		}

		const session = await findRegistrationSession({
			registrationSessionId: registrationSessionId || undefined,
			userId,
			renewIfExpired: true,
		});
		if (!session) {
			return jsonError(
				'Registration session not found or expired. Refresh and resume setup with your Signatura ID.',
				404,
			);
		}

		await touchRegistrationSession(session.id, userId);

		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user) return jsonError('Account not found', 404);

		const credential = await prisma.webAuthnCredential.findFirst({
			where: { userId },
			orderBy: { createdAt: 'desc' },
		});

		const existingTrustedDevice = credential
			? await prisma.trustedDevice.findFirst({
					where: {
						userId,
						credentialId: credential.credentialId,
						removedAt: null,
						isTrusted: true,
					},
				})
			: await prisma.trustedDevice.findFirst({
					where: {
						userId,
						removedAt: null,
						isTrusted: true,
					},
					orderBy: { createdAt: 'desc' },
				});

		if (existingTrustedDevice) {
			if (existingTrustedDevice.credentialId) {
				await prisma.trustedDevice.update({
					where: { id: existingTrustedDevice.id },
					data: {
						deviceHash: trustedDeviceBindingHash({
							userId,
							credentialId: existingTrustedDevice.credentialId,
							deviceBindingSecret,
						}),
					},
				});
			}
			const userForResponse = [
				REGISTRATION_STATUSES.PASSKEY_CREATED,
				REGISTRATION_STATUSES.PENDING_TRUSTED_DEVICE_REGISTRATION,
			].includes(user.accountStatus)
				? await prisma.user.update({
						where: { id: user.id },
						data: {
							accountStatus: REGISTRATION_STATUSES.TRUSTED_DEVICE_REGISTERED,
						},
					})
				: user;

			await signaturaAppLinkModel()?.updateMany({
				where: {
					userId,
					sourceApp: 'ACCURA',
					status: 'ACTIVE',
				},
				data: { trustedDeviceStatus: 'TRUSTED' },
			});

			return trustedDeviceSuccessResponse(
				userForResponse,
				existingTrustedDevice,
			);
		}

		const allowedStatuses = new Set([
			REGISTRATION_STATUSES.PASSKEY_CREATED,
			REGISTRATION_STATUSES.PENDING_TRUSTED_DEVICE_REGISTRATION,
		]);
		if (!allowedStatuses.has(user.accountStatus)) {
			return jsonError('Passkey must be created before trusted device registration', 409);
		}

		if (!credential) {
			return jsonError('Registered passkey not found for this account', 404);
		}
		if (credential.isTrusted) {
			return jsonError('Trusted credential is missing device registration', 409);
		}

		const userAgent = getUserAgent(req);

		const result = await prisma.$transaction(async (tx) => {
			await tx.webAuthnCredential.update({
				where: { id: credential.id },
				data: {
					deviceName,
					userAgent,
					isTrusted: true,
					lastUsedAt: new Date(),
				},
			});

			const trustedDevice = await tx.trustedDevice.create({
				data: {
					id: crypto.randomUUID(),
					userId,
					credentialId: credential.credentialId,
					deviceName,
					deviceHash: trustedDeviceBindingHash({
						userId,
						credentialId: credential.credentialId,
						deviceBindingSecret,
					}),
					userAgent,
					lastUsedAt: new Date(),
					isTrusted: true,
				},
			});

			await tx.securityEventLog.create({
				data: {
					id: crypto.randomUUID(),
					userId,
					event: 'trusted_device_registered',
					userAgent,
					details: {
						deviceName,
						credentialId: credential.credentialId,
						notice: 'Trusted device registered during onboarding',
					},
				},
			});

			const updatedUser = await tx.user.update({
				where: { id: userId },
				data: {
					accountStatus: REGISTRATION_STATUSES.TRUSTED_DEVICE_REGISTERED,
				},
			});

			await signaturaAppLinkModel(tx)?.updateMany({
				where: {
					userId,
					sourceApp: 'ACCURA',
					status: 'ACTIVE',
				},
				data: { trustedDeviceStatus: 'TRUSTED' },
			});

			return { updatedUser, trustedDevice };
		});

		await logAuthAudit(req, 'trusted_device_registered', {
			userId: result.updatedUser.id,
			details: {
				deviceName,
				firstTrustedDevice: true,
			},
		});

		await logSecurityEvent(req, 'trusted_device_registered', userId, {
			deviceName,
			registrationSessionId: session.id,
		});

		return trustedDeviceSuccessResponse(result.updatedUser, result.trustedDevice);
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to register trusted device'),
			400,
		);
	}
}
