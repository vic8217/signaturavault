import { generateRegistrationOptions } from '@simplewebauthn/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { createUniqueSignaturaId } from '@/lib/identity';
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
		const deviceName = String(body.deviceName || '').trim() || 'Trusted device';
		const signaturaId = await createUniqueSignaturaId(prisma);
		const user = await prisma.user.create({
			data: {
				id: crypto.randomUUID(),
				signaturaId,
				email: null,
				name: null,
				accountStatus: 'active',
				trustLevel: 1,
			},
		});

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
		});

		return Response.json({ userId: user.id, signaturaId: user.signaturaId, options });
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to start registration'),
			400,
		);
	}
}
