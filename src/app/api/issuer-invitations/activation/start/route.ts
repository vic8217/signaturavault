import {
	generateAuthenticationOptions,
} from '@simplewebauthn/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { requireSession } from '@/lib/session';
import {
	assertSecureWebAuthnRequest,
	challengeExpiresAt,
	getRpID,
	getUserAgent,
	hashActivationToken,
	logSecurityEvent,
} from '@/lib/webauthn';

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json();
		const token = String(body.token || '').trim();
		const deviceName =
			String(body.deviceName || '').trim() || 'Issuer trusted device';

		if (!token) return jsonError('Activation token is required');
		const session = await requireSession();
		if (!session?.userId) {
			return jsonError('Continue with your Signatura ID before linking issuer access', 401);
		}

		const invitation = await prisma.issuerInvitation.findFirst({
			where: {
				tokenHash: hashActivationToken(token),
				usedAt: null,
				expiresAt: { gt: new Date() },
			},
		});

		if (!invitation) {
			return jsonError('Activation link is invalid, expired, or already used', 400);
		}

		const user = await prisma.user.findUnique({
			where: { id: session.userId },
			include: { credentials: true },
		});

		if (!user || user.accountStatus !== 'active') {
			return jsonError('Complete Signatura ID setup before linking issuer access', 409);
		}

		const trustedCredentials = user.credentials.filter(
			(credential) => credential.isTrusted,
		);
		if (!trustedCredentials.length) {
			return jsonError('No trusted passkey is registered for this Signatura ID', 409);
		}
		const options = await generateAuthenticationOptions({
			rpID: getRpID(req),
			userVerification: 'required',
			timeout: 60000,
			allowCredentials: trustedCredentials.map((credential) => ({
				id: credential.credentialId,
				transports: credential.transports as never,
			})),
		});

		await prisma.authChallenge.create({
			data: {
				id: crypto.randomUUID(),
				userId: user.id,
				issuerInvitationId: invitation.id,
				type: 'ISSUER_INVITATION_ACTIVATION',
				challenge: options.challenge,
				deviceName,
				userAgent: getUserAgent(req),
				expiresAt: challengeExpiresAt(),
			},
		});

		await logSecurityEvent(req, 'issuer_activation_challenge_created', user.id, {
			invitationId: invitation.id,
			tenantId: invitation.tenantId,
			deliveryChannel: invitation.deliveryChannel,
			mode: 'authentication',
		});

		return Response.json({
			userId: user.id,
			signaturaId: user.signaturaId,
			invitationId: invitation.id,
			mode: 'authentication',
			options,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to start activation'),
			400,
		);
	}
}
