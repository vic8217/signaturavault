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
		const email = String(body.email || '').trim().toLowerCase();
		const name = String(body.name || '').trim();
		const deviceName = String(body.deviceName || '').trim() || 'Trusted device';

		if (!email) {
			return jsonError('Email is required');
		}

		const existing = await prisma.user.findUnique({
			where: { email },
			include: { credentials: true },
		});
		if (existing?.credentials.length) {
			return jsonError('Account already exists. Please sign in instead.', 409);
		}

		const user =
			existing ||
			(await prisma.user.create({
				data: {
					id: crypto.randomUUID(),
					email,
					name: name || null,
				},
			}));

		const options = await generateRegistrationOptions({
			rpName: RP_NAME,
			rpID: getRpID(req),
			userID: new TextEncoder().encode(user.id),
			userName: user.email,
			userDisplayName: user.name || user.email,
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

		return Response.json({ userId: user.id, options });
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to start registration'),
			400,
		);
	}
}
