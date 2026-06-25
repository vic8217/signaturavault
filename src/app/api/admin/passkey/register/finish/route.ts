import { verifyRegistrationResponse } from '@simplewebauthn/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	adminSetupTokenModel,
	validateAdminSetupToken,
} from '@/lib/adminSetupToken';
import { REGISTRATION_STATUSES } from '@/lib/registration-status';
import { registrationSessionExpiresAt } from '@/lib/registration-session';
import {
	assertSecureWebAuthnRequest,
	consumeChallenge,
	getOrigin,
	getRpID,
	getUserAgent,
	logSecurityEvent,
} from '@/lib/webauthn';

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json().catch(() => ({}));
		const token = String(body.token || '').trim();
		const response = body.response;
		const deviceName = String(body.deviceName || '').trim() || 'Admin phone';
		if (!response) return jsonError('response is required', 400);

		const tokenResult = await validateAdminSetupToken(req, token, {
			auditEvent: 'admin_setup_passkey_registration_finishing',
		});
		if (!tokenResult.ok) return jsonError(tokenResult.message, tokenResult.status);
		const user = tokenResult.record.user;

		const challenge = await prisma.authChallenge.findFirst({
			where: {
				userId: user.id,
				type: 'ADMIN_SETUP_PASSKEY',
				usedAt: null,
				expiresAt: { gt: new Date() },
			},
			orderBy: { createdAt: 'desc' },
		});
		if (!challenge) {
			return jsonError('Admin passkey challenge expired. Tap Create Admin Passkey again.', 400);
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
			type: 'ADMIN_SETUP_PASSKEY',
			userId: user.id,
		});

		if (!verification.verified || !verification.registrationInfo) {
			await logSecurityEvent(req, 'admin_setup_passkey_registration_failed', user.id, {
				tokenId: tokenResult.record.id,
			});
			return jsonError('Passkey registration could not be verified', 400);
		}

		const { credential, credentialDeviceType, credentialBackedUp } =
			verification.registrationInfo;
		const authenticatorAttachment =
			typeof response?.authenticatorAttachment === 'string'
				? response.authenticatorAttachment
				: null;
		const transports = Array.isArray(credential.transports)
			? credential.transports.map((transport) => String(transport))
			: [];
		if (
			authenticatorAttachment === 'platform' &&
			!transports.map((transport) => transport.toLowerCase()).includes('internal')
		) {
			transports.push('internal');
		}
		const userAgent = getUserAgent(req);
		const now = new Date();

		const result = await prisma.$transaction(async (tx) => {
			const consumeResult = await adminSetupTokenModel(tx).updateMany({
				where: {
					id: tokenResult.record.id,
					userId: user.id,
					status: 'ACTIVE',
					usedAt: null,
					expiresAt: { gt: now },
				},
				data: {
					status: 'USED',
					usedAt: now,
				},
			});
			if (consumeResult.count !== 1) {
				throw new Error('This setup QR has expired or was already used.');
			}

			await tx.webAuthnCredential.create({
				data: {
					id: crypto.randomUUID(),
					userId: user.id,
					credentialId: credential.id,
					publicKey: Buffer.from(credential.publicKey),
					counter: credential.counter,
					transports,
					deviceName,
					userAgent,
					lastUsedAt: now,
					isTrusted: true,
				},
			});

			await tx.trustedDevice.create({
				data: {
					id: crypto.randomUUID(),
					userId: user.id,
					credentialId: credential.id,
					deviceName,
					deviceHash: crypto
						.createHash('sha256')
						.update(`${user.id}:${credential.id}`)
						.digest('hex'),
					userAgent,
					lastUsedAt: now,
					isTrusted: true,
				},
			});

			await tx.securityEventLog.createMany({
				data: [
					{
						id: crypto.randomUUID(),
						userId: user.id,
						event: 'admin_setup_passkey_registration_completed',
						userAgent,
						details: {
							tokenId: tokenResult.record.id,
							deviceName,
							credentialDeviceType,
							credentialBackedUp,
							authenticatorAttachment,
						},
					},
					{
						id: crypto.randomUUID(),
						userId: user.id,
						event: 'admin_setup_token_used',
						userAgent,
						details: {
							tokenId: tokenResult.record.id,
						},
					},
				],
			});

			const registrationSession = await tx.authChallenge.create({
				data: {
					id: crypto.randomUUID(),
					userId: user.id,
					type: 'REGISTER_ACCOUNT',
					challenge: crypto.randomBytes(32).toString('base64url'),
					deviceName,
					userAgent,
					expiresAt: registrationSessionExpiresAt(),
				},
			});

			const updatedUser = await tx.user.update({
				where: { id: user.id },
				data: {
					accountStatus: REGISTRATION_STATUSES.TRUSTED_DEVICE_REGISTERED,
				},
			});

			return { updatedUser, registrationSession };
		});

		await logSecurityEvent(req, 'admin_setup_passkey_registration_completed', user.id, {
			tokenId: tokenResult.record.id,
			deviceName,
			credentialDeviceType,
			credentialBackedUp,
			authenticatorAttachment,
			currentStep: REGISTRATION_STATUSES.TRUSTED_DEVICE_REGISTERED,
		});

		return Response.json({
			ok: true,
			requiresRecovery: true,
			next: '/admin',
			user: {
				id: result.updatedUser.id,
				signaturaId: result.updatedUser.signaturaId,
				accountStatus: result.updatedUser.accountStatus,
				trustLevel: result.updatedUser.trustLevel,
			},
			registrationSessionId: result.registrationSession.id,
			currentStep: REGISTRATION_STATUSES.TRUSTED_DEVICE_REGISTERED,
			eventDetails: {
				tokenId: tokenResult.record.id,
				deviceName,
			},
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to finish admin passkey setup'),
			400,
		);
	}
}
