import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
} from '@simplewebauthn/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { createPendingInvitationIdentity } from '@/lib/signaturaIdentityService';
import {
	RP_NAME,
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
		const deviceName = String(body.deviceName || '').trim() || 'Issuer device';

		if (!token) return jsonError('Activation token is required');

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

		const issuerUser = invitation.issuerUserId
			? await prisma.issuerUser.findUnique({
					where: { id: invitation.issuerUserId },
					select: { userId: true },
				})
			: null;
		let user = issuerUser?.userId
			? await prisma.user.findUnique({
					where: { id: issuerUser.userId },
					include: { credentials: true },
				})
			: null;
		if (!user) {
			const createdIdentity = await createPendingInvitationIdentity(prisma);
			user = await prisma.user.findUnique({
				where: { id: createdIdentity.id },
				include: { credentials: true },
			});
		}

		if (!user) return jsonError('Activation user could not be prepared', 400);

		const trustedCredentials = user.credentials.filter(
			(credential) => credential.isTrusted,
		);
		const mode =
			trustedCredentials.length > 0 ? 'authentication' : 'registration';
		const options =
			mode === 'authentication'
				? await generateAuthenticationOptions({
						rpID: getRpID(req),
						userVerification: 'required',
						timeout: 60000,
						allowCredentials: trustedCredentials.map((credential) => ({
							id: credential.credentialId,
							transports: credential.transports as never,
						})),
					})
				: await generateRegistrationOptions({
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
			mode,
		});

		return Response.json({
			userId: user.id,
			signaturaId: user.signaturaId,
			invitationId: invitation.id,
			mode,
			options,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to start activation'),
			400,
		);
	}
}
