import {
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from '@simplewebauthn/server';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { userPublicIdentity } from '@/lib/identity';
import { ROLE_COOKIE, ROLES } from '@/lib/roles';
import {
	REGISTRATION_STATUSES,
} from '@/lib/registration-status';
import { registrationSessionExpiresAt } from '@/lib/registration-session';
import { setSessionCookie } from '@/lib/session';
import {
	UNIVERSAL_ROLE_CODES,
	ensureIssuerMembershipRole,
} from '@/lib/universalIdentity';
import {
	assertSecureWebAuthnRequest,
	consumeChallenge,
	getOrigin,
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
		const invitationId = String(body.invitationId || '').trim();
		const userId = String(body.userId || '').trim();
		const deviceName = String(body.deviceName || '').trim() || 'Issuer device';
		const mode = String(body.mode || 'registration');
		const response = body.response;

		if (!token || !invitationId || !userId || !response) {
			return jsonError('token, invitationId, userId, and response are required');
		}
		if (mode !== 'authentication' && mode !== 'registration') {
			return jsonError('Activation mode is invalid');
		}

		const invitation = await prisma.issuerInvitation.findFirst({
			where: {
				id: invitationId,
				tokenHash: hashActivationToken(token),
				usedAt: null,
				expiresAt: { gt: new Date() },
			},
		});

		if (!invitation) {
			return jsonError('Activation link is invalid, expired, or already used', 400);
		}

		const challenge = await prisma.authChallenge.findFirst({
			where: {
				userId,
				issuerInvitationId: invitation.id,
				type: 'ISSUER_INVITATION_ACTIVATION',
				usedAt: null,
				expiresAt: { gt: new Date() },
			},
			orderBy: { createdAt: 'desc' },
		});

		if (!challenge) return jsonError('Activation challenge expired', 400);

		const userAgent = getUserAgent(req);
		const now = new Date();
		let credentialId = '';
		let existingCredentialForUpdate = null;
		let newCounter = null;
		let newCredentialForCreate = null;

		if (mode === 'authentication') {
			const existingCredential = await prisma.webAuthnCredential.findUnique({
				where: { credentialId: response.id },
			});

			if (
				!existingCredential ||
				existingCredential.userId !== userId ||
				!existingCredential.isTrusted
			) {
				return jsonError('Credential is not trusted for this account', 401);
			}

			const verification = await verifyAuthenticationResponse({
				response,
				expectedChallenge: challenge.challenge,
				expectedOrigin: getOrigin(req),
				expectedRPID: getRpID(req),
				requireUserVerification: true,
				credential: {
					id: existingCredential.credentialId,
					publicKey: existingCredential.publicKey,
					counter: existingCredential.counter,
					transports: existingCredential.transports as never,
				},
			});

			await consumeChallenge({
				challenge: challenge.challenge,
				type: 'ISSUER_INVITATION_ACTIVATION',
				userId,
			});

			if (!verification.verified) {
				await logSecurityEvent(
					req,
					'issuer_activation_verification_failed',
					userId,
					{
						invitationId: invitation.id,
						mode,
					},
				);
				return jsonError('Trusted-device verification failed', 401);
			}

			credentialId = existingCredential.credentialId;
			existingCredentialForUpdate = existingCredential;
			newCounter = verification.authenticationInfo.newCounter;
		} else {
			const verification = await verifyRegistrationResponse({
				response,
				expectedChallenge: challenge.challenge,
				expectedOrigin: getOrigin(req),
				expectedRPID: getRpID(req),
				requireUserVerification: true,
			});

			await consumeChallenge({
				challenge: challenge.challenge,
				type: 'ISSUER_INVITATION_ACTIVATION',
				userId,
			});

			if (!verification.verified || !verification.registrationInfo) {
				await logSecurityEvent(
					req,
					'issuer_activation_verification_failed',
					userId,
					{
						invitationId: invitation.id,
						mode,
					},
				);
				return jsonError('Trusted-device registration could not be verified', 400);
			}

			const { credential } = verification.registrationInfo;
			credentialId = credential.id;
			newCredentialForCreate = credential;
		}

		const result = await prisma.$transaction(async (tx) => {
			const activatedUser = await tx.user.findUnique({ where: { id: userId } });
			if (!activatedUser) throw new Error('User not found');

			if (existingCredentialForUpdate) {
				await tx.webAuthnCredential.update({
					where: { id: existingCredentialForUpdate.id },
					data: {
						counter: newCounter,
						lastUsedAt: now,
					},
				});

				await tx.trustedDevice.updateMany({
					where: {
						userId,
						credentialId: existingCredentialForUpdate.credentialId,
						removedAt: null,
					},
					data: { lastUsedAt: now },
				});
			} else if (newCredentialForCreate) {
				await tx.webAuthnCredential.create({
					data: {
						id: crypto.randomUUID(),
						userId,
						credentialId: newCredentialForCreate.id,
						publicKey: Buffer.from(newCredentialForCreate.publicKey),
						counter: newCredentialForCreate.counter,
						transports: newCredentialForCreate.transports || [],
						deviceName,
						userAgent,
						lastUsedAt: now,
						isTrusted: true,
					},
				});

				await tx.trustedDevice.create({
					data: {
						id: crypto.randomUUID(),
						userId,
						credentialId: newCredentialForCreate.id,
						deviceName,
						deviceHash: crypto
							.createHash('sha256')
							.update(`${userId}:${newCredentialForCreate.id}`)
							.digest('hex'),
						userAgent,
						lastUsedAt: now,
						isTrusted: true,
					},
				});
			}

			if (mode === 'registration') {
				const registrationSessionId = crypto.randomUUID();
				const existingSession = await tx.authChallenge.findFirst({
					where: {
						userId,
						issuerInvitationId: invitation.id,
						type: 'REGISTER_ACCOUNT',
						usedAt: null,
					},
					orderBy: { createdAt: 'desc' },
				});
				const registrationSession =
					existingSession ||
					(await tx.authChallenge.create({
						data: {
							id: registrationSessionId,
							userId,
							issuerInvitationId: invitation.id,
							type: 'REGISTER_ACCOUNT',
							challenge: crypto.randomBytes(32).toString('base64url'),
							deviceName,
							userAgent,
							expiresAt: registrationSessionExpiresAt(),
						},
					}));
				const setupUser = await tx.user.update({
					where: { id: userId },
					data: {
						accountStatus: REGISTRATION_STATUSES.TRUSTED_DEVICE_REGISTERED,
					},
				});
				return {
					user: setupUser,
					registrationSessionId: registrationSession.id,
					requiresRecovery: true,
				};
			}

			const updated = await tx.issuerInvitation.updateMany({
				where: {
					id: invitation.id,
					usedAt: null,
					expiresAt: { gt: now },
				},
				data: {
					usedAt: now,
					activatedAt: now,
				},
			});

			if (updated.count !== 1) {
				throw new Error('Activation token was already used');
			}

			if (invitation.issuerUserId) {
				await tx.issuerUser.update({
					where: { id: invitation.issuerUserId },
					data: {
						userId,
						status: 'active',
						activatedAt: now,
					},
				});
			}

			const universalRole =
				invitation.role === ROLES.ISSUER_ADMIN
					? UNIVERSAL_ROLE_CODES.ISSUER_ADMIN
					: UNIVERSAL_ROLE_CODES.ISSUER_STAFF;
			await ensureIssuerMembershipRole(tx, {
				identityId: userId,
				tenantId: invitation.tenantId,
				issuerId: invitation.issuerId,
				issuerName: invitation.issuerId || invitation.tenantId,
				roleCode: universalRole,
			});

			const activeUser = await tx.user.update({
				where: { id: userId },
				data: {
					accountStatus: 'active',
					trustLevel: Math.max(Number(activatedUser.trustLevel || 1), 2),
				},
			});

			await tx.securityEventLog.create({
				data: {
					id: crypto.randomUUID(),
					userId,
					event: 'issuer_invitation_activation_succeeded_notify_org',
					userAgent,
					details: {
						invitationId: invitation.id,
						tenantId: invitation.tenantId,
						issuerId: invitation.issuerId,
						deliveryChannel: invitation.deliveryChannel,
						deviceName,
						mode,
						notification:
							'Issuer organization should be notified that invitation activation succeeded.',
					},
				},
			});

			return activeUser;
		});
		const user = result.user;

		await logSecurityEvent(req, 'issuer_trusted_device_registered', user.id, {
			invitationId: invitation.id,
			tenantId: invitation.tenantId,
			credentialId,
			mode,
		});

		if (result.requiresRecovery) {
			return NextResponse.json({
				ok: true,
				next: '/issuer',
				requiresRecovery: true,
				registrationSessionId: result.registrationSessionId,
				currentStep: REGISTRATION_STATUSES.TRUSTED_DEVICE_REGISTERED,
				user: userPublicIdentity(user),
				tenantId: invitation.tenantId,
				issuerId: invitation.issuerId,
			});
		}

		const responseJson = NextResponse.json({
			ok: true,
			next: '/issuer',
			user: userPublicIdentity(user),
			tenantId: invitation.tenantId,
			issuerId: invitation.issuerId,
		});
		const portalRole =
			invitation.role === ROLES.ISSUER_ADMIN
				? ROLES.ISSUER_ADMIN
				: ROLES.ISSUER_STAFF;
		setSessionCookie(responseJson, req, {
			userId: user.id,
			signaturaId: user.signaturaId,
			role: portalRole,
			trustLevel: user.trustLevel,
			iat: Date.now(),
			createdAt: Date.now(),
			reauthenticatedAt: Date.now(),
		});
		responseJson.cookies.set(
			ROLE_COOKIE,
			portalRole,
			{
				httpOnly: true,
				sameSite: 'lax',
				secure: process.env.NODE_ENV === 'production',
				path: '/',
				maxAge: 60 * 60 * 8,
			},
		);

		return responseJson;
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to finish activation'),
			400,
		);
	}
}
