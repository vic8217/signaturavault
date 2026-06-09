import { generateAuthenticationOptions } from '@simplewebauthn/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { normalizeSignaturaId } from '@/lib/identity';
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
		const body = await req.json();
		const signaturaId = normalizeSignaturaId(body.signaturaId || body.userId);

		if (!signaturaId) {
			return jsonError('Signatura ID is required');
		}

		const user = await prisma.user.findUnique({
			where: { signaturaId },
			include: { credentials: { where: { isTrusted: true } } },
		});

		if (!user || user.credentials.length === 0) {
			return jsonError('No passkey is registered for this account', 404);
		}

		const options = await generateAuthenticationOptions({
			rpID: getRpID(req),
			userVerification: 'required',
			timeout: 60000,
			allowCredentials: user.credentials.map((credential) => ({
				id: credential.credentialId,
				transports: credential.transports as never,
			})),
		});

		await prisma.authChallenge.create({
			data: {
				id: crypto.randomUUID(),
				userId: user.id,
				type: 'LOGIN_PASSKEY',
				challenge: options.challenge,
				userAgent: getUserAgent(req),
				expiresAt: challengeExpiresAt(),
			},
		});

		await logSecurityEvent(req, 'login_challenge_created', user.id);

		return Response.json({ userId: user.id, signaturaId: user.signaturaId, options });
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to start login'),
			400,
		);
	}
}
