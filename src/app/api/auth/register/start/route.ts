import { generateRegistrationOptions } from '@simplewebauthn/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	RP_NAME,
	assertSecureWebAuthnRequest,
	challengeExpiresAt,
	getOrigin,
	getRpID,
	getUserAgent,
	logSecurityEvent,
} from '@/lib/webauthn';

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json();
		const userId = String(body.userId || '').trim();
		const registrationToken = String(body.registrationToken || '').trim();
		const deviceName = String(body.deviceName || '').trim() || 'Trusted device';

		if (!userId || !registrationToken) {
			return jsonError('userId and registrationToken are required');
		}

		const accountChallenge = await prisma.authChallenge.findFirst({
			where: {
				userId,
				type: 'REGISTER_ACCOUNT',
				challenge: registrationToken,
				usedAt: null,
				expiresAt: { gt: new Date() },
			},
		});
		if (!accountChallenge) {
			return jsonError('Account creation token expired or already used', 400);
		}

		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { id: true, signaturaId: true, accountStatus: true },
		});
		if (!user) return jsonError('Account not found', 404);

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
			timeout: 60000,
		});

		await prisma.authChallenge.create({
			data: {
				id: crypto.randomUUID(),
				userId: user.id,
				type: 'REGISTER_PASSKEY',
				challenge: options.challenge,
				deviceName,
				userAgent: getUserAgent(req),
				expiresAt: challengeExpiresAt(),
			},
		});

		await logSecurityEvent(req, 'registration_challenge_created', user.id, {
			origin: getOrigin(req),
			deviceName,
			accountStatus: user.accountStatus,
		});

		return Response.json({ userId: user.id, signaturaId: user.signaturaId, options });
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to start registration'),
			400,
		);
	}
}
