import { verifyRegistrationResponse } from '@simplewebauthn/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	SIGNATURA_ACCOUNT_TYPES,
	getSignaturaAccountType,
	userPublicIdentity,
} from '@/lib/identity';
import { REGISTRATION_STATUSES } from '@/lib/registration-status';
import { touchRegistrationSession } from '@/lib/registration-session';
import {
	assertSecureWebAuthnRequest,
	consumeChallenge,
	getOrigin,
	getRpID,
	getUserAgent,
	logSecurityEvent,
} from '@/lib/webauthn';
import {
	APPLICATION_CODES,
	UNIVERSAL_ROLE_CODES,
	identityHasUniversalRole,
} from '@/lib/universalIdentity';

function passkeySummaryFromCredential(
	credential: {
		deviceName?: string | null;
		transports?: string[];
		userAgent?: string | null;
	},
	registrationInfo?: {
		credentialDeviceType?: string;
		credentialBackedUp?: boolean;
		authenticatorAttachment?: string;
	},
) {
	return {
		passkeyStatus: 'Active',
		credentialRegistered: true,
		deviceName: credential.deviceName || 'This device',
		transports: credential.transports || [],
		userAgent: credential.userAgent || null,
		authenticatorAttachment: registrationInfo?.authenticatorAttachment || null,
		credentialDeviceType: registrationInfo?.credentialDeviceType || null,
		credentialBackedUp: Boolean(registrationInfo?.credentialBackedUp),
	};
}

function isAdminLocalPlatformRegistration({
	authenticatorAttachment,
	credentialDeviceType,
	credentialBackedUp,
}: {
	authenticatorAttachment?: string | null;
	credentialDeviceType?: string | null;
	credentialBackedUp?: boolean;
}) {
	return (
		authenticatorAttachment === 'platform' &&
		credentialDeviceType === 'singleDevice' &&
		credentialBackedUp === false
	);
}

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json();
		const userId = String(body.userId || '');
		const deviceName = String(body.deviceName || '').trim() || 'This device';
		const response = body.response;

		if (!userId || !response) {
			return jsonError('userId and response are required');
		}

		const challenge = await prisma.authChallenge.findFirst({
			where: {
				userId,
				type: 'REGISTER_PASSKEY',
				usedAt: null,
				expiresAt: { gt: new Date() },
			},
			orderBy: { createdAt: 'desc' },
		});

		if (!challenge) {
			return jsonError('Registration challenge expired or already used', 400);
		}

		const verification = await verifyRegistrationResponse({
			response,
			expectedChallenge: challenge.challenge,
			expectedOrigin: getOrigin(req),
			expectedRPID: getRpID(req),
			requireUserVerification: true,
		});

		await consumeChallenge({
			challenge: challenge.challenge,
			type: 'REGISTER_PASSKEY',
			userId,
		});

		if (!verification.verified || !verification.registrationInfo) {
			await logSecurityEvent(req, 'registration_verification_failed', userId);
			return jsonError('Passkey registration could not be verified', 400);
		}

		const { credential, credentialDeviceType, credentialBackedUp } =
			verification.registrationInfo;
		const userAgent = getUserAgent(req);
		const resolvedDeviceName = challenge.deviceName || deviceName;
		const authenticatorAttachment =
			typeof response?.authenticatorAttachment === 'string'
				? response.authenticatorAttachment
				: null;

		const result = await prisma.$transaction(async (tx) => {
			const user = await tx.user.findUnique({ where: { id: userId } });
			if (!user) throw new Error('User not found');
			const hasLegacyAdminId =
				getSignaturaAccountType(user.signaturaId) === SIGNATURA_ACCOUNT_TYPES.ADMIN;
			const hasAdminMembership = await identityHasUniversalRole(user.id, {
				applicationCode: APPLICATION_CODES.SIGNATURA,
				roleCodes: [UNIVERSAL_ROLE_CODES.SIGNATURA_SYSTEM_ADMIN],
				organizationId: null,
			});
			const isAdminAccount = hasLegacyAdminId || hasAdminMembership;
			if (
				isAdminAccount &&
				!isAdminLocalPlatformRegistration({
					authenticatorAttachment,
					credentialDeviceType,
					credentialBackedUp,
				})
			) {
				throw new Error(
					'Admin registration requires a local device passkey. Phone QR, synced, or backed-up passkeys are not allowed for admin accounts.',
				);
			}

			const existingCredential = await tx.webAuthnCredential.findFirst({
				where: {
					userId,
					credentialId: credential.id,
				},
			});
			if (existingCredential) {
				throw new Error('Passkey already registered for this account');
			}

			await tx.webAuthnCredential.create({
				data: {
					id: crypto.randomUUID(),
					userId,
					credentialId: credential.id,
					publicKey: Buffer.from(credential.publicKey),
					counter: credential.counter,
					transports: credential.transports || [],
					deviceName: resolvedDeviceName,
					userAgent,
					lastUsedAt: new Date(),
					isTrusted: false,
				},
			});

			await tx.securityEventLog.create({
				data: {
					id: crypto.randomUUID(),
					userId,
					event: 'passkey_created',
					userAgent,
					details: {
						deviceName: resolvedDeviceName,
						credentialDeviceType,
						credentialBackedUp,
						notice: 'Passkey verified; trusted device registration pending',
					},
				},
			});

			const updatedUser = await tx.user.update({
				where: { id: userId },
				data: {
					accountStatus: REGISTRATION_STATUSES.PASSKEY_CREATED,
				},
			});

			return updatedUser;
		});

		await logSecurityEvent(req, 'passkey_created', userId, {
			deviceName: resolvedDeviceName,
			credentialDeviceType,
			credentialBackedUp,
		});

		await touchRegistrationSession('', userId);

		const passkeySummary = passkeySummaryFromCredential(
			{
				deviceName: resolvedDeviceName,
				transports: credential.transports || [],
				userAgent,
			},
			{
				credentialDeviceType,
				credentialBackedUp,
				authenticatorAttachment,
			},
		);

		return Response.json({
			ok: true,
			user: userPublicIdentity(result),
			currentStep: REGISTRATION_STATUSES.PASSKEY_CREATED,
			passkeySummary,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to finish passkey registration'),
			400,
		);
	}
}
