import { verifyRegistrationResponse } from '@simplewebauthn/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { userPublicIdentity } from '@/lib/identity';
import { requireSession } from '@/lib/session';
import {
	normalizeDeviceBindingSecret,
	trustedDeviceBindingHash,
} from '@/lib/trustedDeviceBinding';
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
		const session = await requireSession();
		if (!session) return jsonError('Authentication required', 401);

		const body = await req.json();
		const response = body.response;
		const deviceName = String(body.deviceName || '').trim() || 'Trusted device';
		const deviceBindingSecret = normalizeDeviceBindingSecret(
			body.deviceBindingSecret,
		);
		if (!response) return jsonError('response is required');
		if (!deviceBindingSecret) {
			return jsonError('Trusted device binding secret is required', 400);
		}

		const challenge = await prisma.authChallenge.findFirst({
			where: {
				userId: session.userId,
				type: 'ADD_PASSKEY',
				usedAt: null,
				expiresAt: { gt: new Date() },
			},
			orderBy: { createdAt: 'desc' },
		});

		if (!challenge) return jsonError('Passkey challenge expired', 400);

		const verification = await verifyRegistrationResponse({
			response,
			expectedChallenge: challenge.challenge,
			expectedOrigin: getOrigin(req),
			expectedRPID: getRpID(req),
			requireUserVerification: true,
		});

		await consumeChallenge({
			challenge: challenge.challenge,
			type: 'ADD_PASSKEY',
			userId: session.userId,
		});

		if (!verification.verified || !verification.registrationInfo) {
			await logSecurityEvent(req, 'add_passkey_verification_failed', session.userId);
			return jsonError('Passkey registration could not be verified', 400);
		}

		const { credential } = verification.registrationInfo;
		const userAgent = getUserAgent(req);

		await prisma.$transaction([
			prisma.webAuthnCredential.create({
				data: {
					id: crypto.randomUUID(),
					userId: session.userId,
					credentialId: credential.id,
					publicKey: Buffer.from(credential.publicKey),
					counter: credential.counter,
					transports: credential.transports || [],
					deviceName,
					userAgent,
					lastUsedAt: new Date(),
					isTrusted: true,
				},
			}),
			prisma.trustedDevice.create({
				data: {
					id: crypto.randomUUID(),
					userId: session.userId,
					credentialId: credential.id,
					deviceName,
					deviceHash: trustedDeviceBindingHash({
						userId: session.userId,
						credentialId: credential.id,
						deviceBindingSecret,
					}),
					userAgent,
					lastUsedAt: new Date(),
					isTrusted: true,
				},
			}),
			prisma.securityEventLog.create({
				data: {
					id: crypto.randomUUID(),
					userId: session.userId,
					event: 'trusted_device_added_notify_all',
					userAgent,
					details: {
						deviceName,
						credentialId: credential.id,
						notification:
							'All trusted devices should be notified that a new trusted device was added',
					},
				},
			}),
		]);

		return Response.json({
			ok: true,
			user: userPublicIdentity({
				id: session.userId,
				signaturaId: session.signaturaId,
				accountStatus: session.accountStatus,
				trustLevel: session.trustLevel,
			}),
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to finish passkey setup'),
			400,
		);
	}
}
