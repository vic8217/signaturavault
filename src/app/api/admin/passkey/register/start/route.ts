import { generateRegistrationOptions } from '@simplewebauthn/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	adminSetupPublicUser,
	validateAdminSetupToken,
} from '@/lib/adminSetupToken';
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
		const body = await req.json().catch(() => ({}));
		const token = String(body.token || '').trim();
		const deviceName = String(body.deviceName || '').trim() || 'Admin phone';
		const result = await validateAdminSetupToken(req, token, {
			auditEvent: 'admin_setup_passkey_registration_started',
		});
		if (!result.ok) return jsonError(result.message, result.status);

		const user = result.record.user;
		const options = await generateRegistrationOptions({
			rpName: RP_NAME,
			rpID: getRpID(req),
			userID: new TextEncoder().encode(user.id),
			userName: user.signaturaId,
			userDisplayName: user.signaturaId,
			attestationType: 'none',
			authenticatorSelection: {
				authenticatorAttachment: 'platform',
				residentKey: 'preferred',
				userVerification: 'required',
			},
			timeout: 60000,
		});

		await prisma.authChallenge.create({
			data: {
				id: crypto.randomUUID(),
				userId: user.id,
				type: 'ADMIN_SETUP_PASSKEY',
				challenge: options.challenge,
				deviceName,
				userAgent: getUserAgent(req),
				expiresAt: challengeExpiresAt(),
			},
		});

		await logSecurityEvent(req, 'admin_setup_passkey_challenge_created', user.id, {
			tokenId: result.record.id,
			origin: getOrigin(req),
			deviceName,
		});

		return Response.json({
			ok: true,
			user: adminSetupPublicUser(user),
			options,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to start admin passkey setup'),
			400,
		);
	}
}
