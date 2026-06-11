import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { normalizeSignaturaId, userPublicIdentity } from '@/lib/identity';
import {
	accountLookupHashes,
	normalizeEmail,
	normalizeHandphone,
} from '@/lib/account-private-fields';
import {
	assertSecureWebAuthnRequest,
	challengeExpiresAt,
	getUserAgent,
	logSecurityEvent,
} from '@/lib/webauthn';

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json().catch(() => ({}));
		const signaturaId = normalizeSignaturaId(body.signaturaId);
		const email = normalizeEmail(body.email);
		const handphone = normalizeHandphone(body.handphone);

		if (!signaturaId) return jsonError('SIGNATURA ID is required');
		if (!email) return jsonError('Email address is required');
		if (!handphone) return jsonError('Handphone number is required');

		const { emailLookupHash, mobileLookupHash } = accountLookupHashes({
			email,
			handphone,
		});
		const user = await prisma.user.findFirst({
			where: {
				signaturaId,
				emailLookupHash,
				mobileLookupHash,
			},
			include: { credentials: { where: { isTrusted: true } } },
		});

		if (!user) return jsonError('Account details did not match', 404);
		const hasTrustedDevice = user.credentials.length > 0;
		if (hasTrustedDevice && process.env.NODE_ENV === 'production') {
			return jsonError('This account already has a trusted device. Sign in with passkey.', 409);
		}

		const registrationToken = crypto.randomBytes(32).toString('base64url');
		await prisma.authChallenge.create({
			data: {
				id: crypto.randomUUID(),
				userId: user.id,
				type: 'REGISTER_ACCOUNT',
				challenge: registrationToken,
				userAgent: getUserAgent(req),
				expiresAt: challengeExpiresAt(),
			},
		});

		await logSecurityEvent(req, 'account_device_setup_resumed', user.id, {
			signaturaId: user.signaturaId,
			lookupVerified: true,
			existingTrustedDeviceCount: user.credentials.length,
			devOriginDeviceRegistration: hasTrustedDevice,
			plaintextStored: false,
		});

		return Response.json({
			ok: true,
			user: userPublicIdentity(user),
			registrationToken,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to resume account setup'),
			400,
		);
	}
}
