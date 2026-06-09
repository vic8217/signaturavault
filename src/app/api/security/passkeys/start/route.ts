import { generateRegistrationOptions } from '@simplewebauthn/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { hasRecentVerification, requireSession } from '@/lib/session';
import {
	RP_NAME,
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
		if (!hasRecentVerification(session)) {
			return jsonError('Recent biometric/passkey verification required', 403);
		}

		const body = await req.json().catch(() => ({}));
		const deviceName = String(body.deviceName || '').trim() || 'Trusted device';
		const user = await prisma.user.findUnique({
			where: { id: session.userId },
			include: { credentials: true },
		});

		if (!user) return jsonError('User not found', 404);

		const options = await generateRegistrationOptions({
			rpName: RP_NAME,
			rpID: getRpID(req),
			userID: new TextEncoder().encode(user.id),
			userName: user.signaturaId,
			userDisplayName: user.signaturaId,
			attestationType: 'none',
			authenticatorSelection: {
				residentKey: 'preferred',
				userVerification: 'required',
			},
			excludeCredentials: user.credentials.map((credential) => ({
				id: credential.credentialId,
				transports: credential.transports as never,
			})),
			timeout: 60000,
		});

		await prisma.authChallenge.create({
			data: {
				id: crypto.randomUUID(),
				userId: user.id,
				type: 'ADD_PASSKEY',
				challenge: options.challenge,
				deviceName,
				userAgent: getUserAgent(req),
				expiresAt: challengeExpiresAt(),
			},
		});

		await logSecurityEvent(req, 'add_passkey_challenge_created', user.id, {
			deviceName,
		});
		return Response.json({ options });
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to start passkey setup'),
			400,
		);
	}
}
