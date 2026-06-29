import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { userPublicIdentity, resolveAccuraLinkedSignaturaId } from '@/lib/identity';
import {
	buildAccuraRegistrationReturnUrl,
	notifyAccuraChallengeApproval,
	notifyAccuraRegistrationCallback,
} from '@/lib/accuraRegistrationHandoff';
import {
	ACCURA_ONBOARDING_ACTIONS,
	auditAccuraOnboardingEvent,
} from '@/lib/accuraOnboardingAudit';
import { REGISTRATION_STATUSES } from '@/lib/registration-status';
import {
	findRegistrationSession,
	touchRegistrationSession,
} from '@/lib/registration-session';
import {
	assertSecureWebAuthnRequest,
	logSecurityEvent,
} from '@/lib/webauthn';
import { ROLE_COOKIE, ROLES } from '@/lib/roles';
import { setSessionCookie } from '@/lib/session';
import {
	APPLICATION_CODES,
	UNIVERSAL_ROLE_CODES,
	ensureAccuraMembershipRole,
	ensureInvoiceIssuerMembershipRole,
	ensureIssuerMembershipRole,
	identityHasUniversalRole,
} from '@/lib/universalIdentity';

function signaturaAppLinkModel(client = prisma) {
	return (
		client as unknown as {
			signaturaAppLink?: {
				findFirst: (args: Record<string, unknown>) => Promise<{
					companyCode?: string | null;
					companyName?: string | null;
					companyId?: string | null;
					registrationContext?: Record<string, unknown> | null;
					role?: string | null;
					rolePrefix?: string | null;
				} | null>;
			};
		}
	).signaturaAppLink;
}

function accuraRegistrationHandoffModel(client = prisma) {
	return (
		client as unknown as {
			accuraRegistrationHandoff?: {
				updateMany: (args: {
					where: Record<string, unknown>;
					data: Record<string, unknown>;
				}) => Promise<{ count: number }>;
			};
		}
	).accuraRegistrationHandoff;
}

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json().catch(() => ({}));
		const userId = String(body.userId || '').trim();
		const registrationSessionId = String(body.registrationSessionId || '').trim();

		if (!registrationSessionId && !userId) {
			return jsonError('registrationSessionId or userId is required', 400);
		}

		const session = await findRegistrationSession({
			registrationSessionId: registrationSessionId || undefined,
			userId: userId || undefined,
			renewIfExpired: true,
		});
		if (!session?.userId) {
			return jsonError(
				'Registration session not found or expired. Refresh and resume setup with your Signatura ID.',
				404,
			);
		}

		const resolvedUserId = userId || session.userId;
		if (userId && userId !== session.userId) {
			return jsonError('Registration session does not match this account', 403);
		}

		await touchRegistrationSession(session.id, session.userId);

		const user = await prisma.user.findUnique({ where: { id: resolvedUserId } });
		if (!user) return jsonError('Account not found', 404);

		const allowedStatuses = new Set([
			REGISTRATION_STATUSES.PENDING_RECOVERY_PHRASE,
			REGISTRATION_STATUSES.PENDING_ACTIVATION,
		]);
		if (!allowedStatuses.has(user.accountStatus)) {
			return jsonError('Recovery phrase must be saved before activation', 409);
		}

		const recoveryCode = await prisma.recoveryCode.findFirst({
			where: { userId: resolvedUserId },
		});
		if (!recoveryCode) {
			return jsonError('Recovery phrase has not been issued for this account', 409);
		}

		const trustedDeviceCount = await prisma.trustedDevice.count({
			where: {
				userId: resolvedUserId,
				isTrusted: true,
				removedAt: null,
				status: 'active',
			},
		});
		if (trustedDeviceCount === 0) {
			return jsonError('Trusted device registration is required before activation', 409);
		}

		const accuraLink = await signaturaAppLinkModel()?.findFirst({
			where: {
				userId: resolvedUserId,
				sourceApp: 'ACCURA',
				status: 'ACTIVE',
			},
			orderBy: { createdAt: 'desc' },
		});
		const accuraLinkedSignaturaId = resolveAccuraLinkedSignaturaId(accuraLink, user);
		const accuraContext =
			accuraLink?.registrationContext &&
			typeof accuraLink.registrationContext === 'object'
				? accuraLink.registrationContext
				: null;
		const accuraRolePrefix = String(
			accuraContext?.accuraRoleCode || accuraLink?.rolePrefix || '',
		).trim().toUpperCase();
		const issuerInvitation = session.issuerInvitationId
			? await prisma.issuerInvitation.findFirst({
					where: {
						id: session.issuerInvitationId,
						usedAt: null,
						expiresAt: { gt: new Date() },
					},
				})
			: null;
		if (session.issuerInvitationId && !issuerInvitation) {
			return jsonError('Issuer invitation is invalid, expired, or already used', 400);
		}
		const pendingIssuerUser =
			!issuerInvitation
				? await prisma.issuerUser.findFirst({
						where: {
							userId: resolvedUserId,
							status: 'pending_activation',
						},
						orderBy: { invitedAt: 'desc' },
					})
				: null;

		const updatedUser = await prisma.$transaction(async (tx) => {
			if (issuerInvitation) {
				const updatedInvitation = await tx.issuerInvitation.updateMany({
					where: {
						id: issuerInvitation.id,
						usedAt: null,
						expiresAt: { gt: new Date() },
					},
					data: {
						usedAt: new Date(),
						activatedAt: new Date(),
					},
				});
				if (updatedInvitation.count !== 1) {
					throw new Error('Issuer invitation was already used');
				}

				if (issuerInvitation.issuerUserId) {
					await tx.issuerUser.update({
						where: { id: issuerInvitation.issuerUserId },
						data: {
							userId: resolvedUserId,
							status: 'active',
							activatedAt: new Date(),
						},
					});
				}

				await ensureIssuerMembershipRole(tx, {
					identityId: resolvedUserId,
					tenantId: issuerInvitation.tenantId,
					issuerId: issuerInvitation.issuerId,
					issuerName: issuerInvitation.issuerId || issuerInvitation.tenantId,
					roleCode: UNIVERSAL_ROLE_CODES.ISSUER_ADMIN,
				});
			}

			if (pendingIssuerUser) {
				await tx.issuerUser.update({
					where: { id: pendingIssuerUser.id },
					data: {
						status: 'active',
						activatedAt: new Date(),
					},
				});
				await ensureIssuerMembershipRole(tx, {
					identityId: resolvedUserId,
					tenantId: pendingIssuerUser.tenantId,
					issuerId: pendingIssuerUser.issuerId,
					issuerName: pendingIssuerUser.issuerId || pendingIssuerUser.tenantId,
					roleCode:
						pendingIssuerUser.role === ROLES.ISSUER_ADMIN
							? UNIVERSAL_ROLE_CODES.ISSUER_ADMIN
							: UNIVERSAL_ROLE_CODES.ISSUER_STAFF,
				});
			}

			if (accuraLink) {
				await ensureAccuraMembershipRole(tx, {
					identityId: resolvedUserId,
					companyId: accuraLink.companyId || accuraLink.companyCode || '',
					companyCode: accuraLink.companyCode || '',
					companyName: accuraLink.companyName || accuraLink.companyCode || '',
					rolePrefix: accuraLink.rolePrefix || '',
					roleName: accuraLink.role || '',
				});
				if (accuraRolePrefix === 'CADM') {
					await ensureInvoiceIssuerMembershipRole(tx, {
						identityId: resolvedUserId,
						companyId: accuraLink.companyId || accuraLink.companyCode || '',
						companyCode: accuraLink.companyCode || '',
						companyName: accuraLink.companyName || accuraLink.companyCode || '',
					});
				}
			}

			const activatedUser = await tx.user.update({
				where: { id: resolvedUserId },
				data: {
					accountStatus: 'active',
					trustLevel: 2,
				},
			});

			await tx.authChallenge.updateMany({
				where: {
					userId: resolvedUserId,
					type: 'REGISTER_ACCOUNT',
					usedAt: null,
				},
				data: { usedAt: new Date() },
			});

			await tx.securityEventLog.create({
				data: {
					id: crypto.randomUUID(),
					userId: resolvedUserId,
					event: 'account_activated',
					details: {
						trustLevel: 2,
						notice: 'Registration completed; user redirected to login',
					},
				},
			});

			if (accuraContext?.handoffTokenId) {
				await accuraRegistrationHandoffModel(tx)?.updateMany({
					where: {
						tokenId: accuraContext.handoffTokenId,
						status: 'CLAIMED',
					},
					data: {
						status: 'PROCESSING',
						completedAt: new Date(),
					},
				});
			}

			return activatedUser;
		});

		await logSecurityEvent(req, 'account_activated', resolvedUserId, {
			registrationSessionId: session.id,
			trustLevel: 2,
		});

		let accuraReturnUrl = '';
		try {
			if (accuraLink && accuraContext) {
				accuraReturnUrl =
					buildAccuraRegistrationReturnUrl(String(accuraContext.returnUrl || ''), {
						signaturaId: accuraLinkedSignaturaId,
						userId: updatedUser.id,
						signaturaSubjectId: updatedUser.id,
						companyId: String(
							accuraContext.accuraCompanyId || accuraLink.companyId || '',
						),
						companyCode: String(
							accuraContext.accuraCompanyCode ||
								accuraLink.companyCode ||
								'',
						),
						roleCode: String(
							accuraContext.accuraRoleCode || accuraLink.rolePrefix || '',
						),
						rolePrefix: String(
							accuraContext.accuraRoleCode || accuraLink.rolePrefix || '',
						),
						registrationKeyId: String(
							accuraContext.accuraRegistrationKeyId || '',
						),
						registrationStatus: 'SUCCESS',
						requestId: String(accuraContext.requestId || accuraContext.handoffTokenId || ''),
						state: String(accuraContext.state || ''),
						nonce: String(accuraContext.nonce || ''),
					}) || '';
				await auditAccuraOnboardingEvent({
					req,
					action: ACCURA_ONBOARDING_ACTIONS.REDIRECT_ISSUED,
					userId: resolvedUserId,
					context: {
						companyId: accuraContext.accuraCompanyId || accuraLink.companyId,
						companyCode: accuraContext.accuraCompanyCode || accuraLink.companyCode,
						rolePrefix: accuraContext.accuraRoleCode || accuraLink.rolePrefix,
						registrationKeyId: accuraContext.accuraRegistrationKeyId,
						requestId: accuraContext.requestId || accuraContext.handoffTokenId,
						state: accuraContext.state,
						nonce: accuraContext.nonce,
					},
					details: {
						signaturaId: accuraLinkedSignaturaId,
						masterSignaturaId: updatedUser.signaturaId,
						accuraReturnUrl,
					},
				});
			}
		} catch {
			accuraReturnUrl = '';
		}

		if (accuraReturnUrl) {
			let verificationToken = '';
			try {
				verificationToken =
					new URL(accuraReturnUrl).searchParams.get('authorizationCode') || '';
			} catch {
				verificationToken = '';
			}
			const challengeId = String(
				accuraContext?.challengeId ||
					accuraContext?.requestId ||
					accuraContext?.handoffTokenId ||
					'',
			);
			const challengeApprovalCallback = await notifyAccuraChallengeApproval({
				returnUrl: String(accuraContext?.returnUrl || ''),
				challengeId,
				signaturaId: accuraLinkedSignaturaId,
				verificationToken,
				status: 'APPROVED',
			}).catch((error) => ({
				ok: false,
				error: error instanceof Error ? error.message : 'callback_failed',
			}));
			console.info('[signatura.accura.registration.activation.approved]', {
				challengeId,
				signaturaId: accuraLinkedSignaturaId,
				callbackUrl: 'target' in challengeApprovalCallback
					? challengeApprovalCallback.target
					: undefined,
				callbackOk: challengeApprovalCallback.ok,
				callbackStatus: 'status' in challengeApprovalCallback
					? challengeApprovalCallback.status
					: undefined,
				callbackBody: 'body' in challengeApprovalCallback
					? String(challengeApprovalCallback.body || '').slice(0, 2000)
					: undefined,
			});
			await accuraRegistrationHandoffModel()?.updateMany({
				where: {
					OR: [
						{ tokenId: accuraContext?.handoffTokenId },
						{ challengeId },
					],
					status: 'PROCESSING',
				},
				data: {
					status: 'APPROVED',
					approvedAt: new Date(),
					completedAt: new Date(),
					signaturaId: accuraLinkedSignaturaId,
					verificationToken,
				},
			});
			await notifyAccuraRegistrationCallback(accuraReturnUrl).catch(() => null);
		}

		const isAdminIdentity =
			!issuerInvitation &&
			!accuraReturnUrl &&
			(await identityHasUniversalRole(updatedUser.id, {
				applicationCode: APPLICATION_CODES.SIGNATURA,
				roleCodes: [UNIVERSAL_ROLE_CODES.SIGNATURA_SYSTEM_ADMIN],
				organizationId: null,
			}));
		const redirectTo = issuerInvitation
			? '/issuer'
			: isAdminIdentity
				? '/admin'
				: accuraReturnUrl || '/login';
		const responseJson = NextResponse.json({
			ok: true,
			user: userPublicIdentity(updatedUser),
			currentStep: REGISTRATION_STATUSES.COMPLETED,
			redirectTo,
			accuraReturnUrl,
		});
		if (issuerInvitation || isAdminIdentity) {
			const portalRole = isAdminIdentity
				? ROLES.SIGNATURA_ADMIN
				: ROLES.ISSUER_ADMIN;
			setSessionCookie(responseJson, req, {
				userId: updatedUser.id,
				signaturaId: updatedUser.signaturaId,
				role: portalRole,
				trustLevel: updatedUser.trustLevel,
				iat: Date.now(),
				createdAt: Date.now(),
				reauthenticatedAt: Date.now(),
			});
			responseJson.cookies.set(ROLE_COOKIE, portalRole, {
				httpOnly: true,
				sameSite: 'lax',
				secure: process.env.NODE_ENV === 'production',
				path: '/',
				maxAge: 60 * 60 * 8,
			});
		}
		return responseJson;
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to activate account'),
			400,
		);
	}
}
