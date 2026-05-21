import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	requireSession,
	setSessionCookie,
	withReauthentication,
} from '@/lib/session';
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
		if (!response) return jsonError('response is required');

		const credential = await prisma.webAuthnCredential.findUnique({
			where: { credentialId: response.id },
		});

		if (
			!credential ||
			credential.userId !== session.userId ||
			!credential.isTrusted
		) {
			return jsonError('Credential is not trusted for this account', 401);
		}

		const challenge = await prisma.authChallenge.findFirst({
			where: {
				userId: session.userId,
				type: 'REAUTH_PASSKEY',
				usedAt: null,
				expiresAt: { gt: new Date() },
			},
			orderBy: { createdAt: 'desc' },
		});

		if (!challenge) return jsonError('Verification challenge expired', 400);

		const verification = await verifyAuthenticationResponse({
			response,
			expectedChallenge: challenge.challenge,
			expectedOrigin: getOrigin(req),
			expectedRPID: getRpID(req),
			requireUserVerification: true,
			credential: {
				id: credential.credentialId,
				publicKey: credential.publicKey,
				counter: credential.counter,
				transports: credential.transports as never,
			},
		});

		await consumeChallenge({
			challenge: challenge.challenge,
			type: 'REAUTH_PASSKEY',
			userId: session.userId,
		});

		if (!verification.verified) {
			await logSecurityEvent(req, 'reauth_verification_failed', session.userId);
			return jsonError('Verification failed', 401);
		}

		await prisma.webAuthnCredential.update({
			where: { id: credential.id },
			data: {
				counter: verification.authenticationInfo.newCounter,
				lastUsedAt: new Date(),
			},
		});

		await prisma.securityEventLog.create({
			data: {
				id: crypto.randomUUID(),
				userId: session.userId,
				event: 'passkey_reverification_succeeded',
				userAgent: getUserAgent(req),
				details: { credentialId: credential.credentialId },
			},
		});

		const nextSession = withReauthentication(session);
		const responseJson = NextResponse.json({ ok: true });
		setSessionCookie(responseJson, req, nextSession);
		return responseJson;
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to finish verification'),
			400,
		);
	}
}
