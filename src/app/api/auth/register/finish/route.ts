import { verifyRegistrationResponse } from '@simplewebauthn/server';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { setSessionCookie } from '@/lib/session';
import { ROLE_COOKIE, ROLES } from '@/lib/roles';
import {
	assertSecureWebAuthnRequest,
	consumeChallenge,
	getOrigin,
	getRpID,
	getUserAgent,
	hashRecoveryCode,
	logSecurityEvent,
	makeRecoveryCodes,
} from '@/lib/webauthn';

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json();
		const userId = String(body.userId || '');
		const deviceName = String(body.deviceName || '').trim() || 'Trusted device';
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

		const { credential } = verification.registrationInfo;
		const recoveryCodes = makeRecoveryCodes();
		const userAgent = getUserAgent(req);

		const result = await prisma.$transaction(async (tx) => {
			const user = await tx.user.findUnique({ where: { id: userId } });
			if (!user) throw new Error('User not found');

			await tx.webAuthnCredential.create({
				data: {
					id: crypto.randomUUID(),
					userId,
					credentialId: credential.id,
					publicKey: Buffer.from(credential.publicKey),
					counter: credential.counter,
					transports: credential.transports || [],
					deviceName,
					userAgent,
					lastUsedAt: new Date(),
					isTrusted: true,
				},
			});

			await tx.trustedDevice.create({
				data: {
					id: crypto.randomUUID(),
					userId,
					credentialId: credential.id,
					deviceName,
					userAgent,
					lastUsedAt: new Date(),
					isTrusted: true,
				},
			});

			await tx.recoveryCode.createMany({
				data: recoveryCodes.map((code) => ({
					id: crypto.randomUUID(),
					userId,
					codeHash: hashRecoveryCode(code),
					codePrefix: code.slice(0, 8),
				})),
			});

			await tx.securityEventLog.create({
				data: {
					id: crypto.randomUUID(),
					userId,
					event: 'trusted_device_registered',
					userAgent,
					details: {
						deviceName,
						credentialId: credential.id,
						notice: 'Recovery codes were shown once during onboarding',
					},
				},
			});

			return user;
		});

		const responseJson = NextResponse.json({
			ok: true,
			user: { id: result.id, email: result.email, name: result.name },
			recoveryCodes,
		});
		setSessionCookie(responseJson, req, {
			userId: result.id,
			email: result.email,
			createdAt: Date.now(),
			reauthenticatedAt: Date.now(),
		});
		responseJson.cookies.set(ROLE_COOKIE, ROLES.DOCUMENT_OWNER, {
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			path: '/',
			maxAge: 60 * 60 * 8,
		});

		return responseJson;
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to finish registration'),
			400,
		);
	}
}
