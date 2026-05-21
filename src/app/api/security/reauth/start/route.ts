import { generateAuthenticationOptions } from '@simplewebauthn/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { requireSession } from '@/lib/session';
import {
	assertSecureWebAuthnRequest,
	challengeExpiresAt,
	getRpID,
	getUserAgent,
	logSecurityEvent,
} from '@/lib/webauthn';

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const session = await requireSession();
		if (!session) return jsonError('Authentication required', 401);

		const credentials = await prisma.webAuthnCredential.findMany({
			where: { userId: session.userId, isTrusted: true },
		});

		if (credentials.length === 0) {
			return jsonError('No trusted passkey is available', 403);
		}

		const options = await generateAuthenticationOptions({
			rpID: getRpID(req),
			userVerification: 'required',
			timeout: 60000,
			allowCredentials: credentials.map((credential) => ({
				id: credential.credentialId,
				transports: credential.transports as never,
			})),
		});

		await prisma.authChallenge.create({
			data: {
				id: crypto.randomUUID(),
				userId: session.userId,
				type: 'REAUTH_PASSKEY',
				challenge: options.challenge,
				userAgent: getUserAgent(req),
				expiresAt: challengeExpiresAt(),
			},
		});

		await logSecurityEvent(req, 'reauth_challenge_created', session.userId);
		return Response.json({ userId: session.userId, options });
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to start verification'),
			400,
		);
	}
}
