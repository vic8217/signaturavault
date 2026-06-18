import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { userPublicIdentity } from '@/lib/identity';
import {
	buildAccuraRegistrationReturnUrl,
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

function signaturaAppLinkModel(client = prisma) {
	return (
		client as unknown as {
			signaturaAppLink?: {
				findFirst: (args: Record<string, unknown>) => Promise<{
					companyCode?: string | null;
					companyId?: string | null;
					registrationContext?: Record<string, unknown> | null;
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
		const accuraContext =
			accuraLink?.registrationContext &&
			typeof accuraLink.registrationContext === 'object'
				? accuraLink.registrationContext
				: null;

		const updatedUser = await prisma.$transaction(async (tx) => {
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
						status: 'COMPLETED',
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
						signaturaId: updatedUser.signaturaId,
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
						signaturaId: updatedUser.signaturaId,
						accuraReturnUrl,
					},
				});
			}
		} catch {
			accuraReturnUrl = '';
		}

		if (accuraReturnUrl) {
			await notifyAccuraRegistrationCallback(accuraReturnUrl).catch(() => null);
		}

		return Response.json({
			ok: true,
			user: userPublicIdentity(updatedUser),
			currentStep: REGISTRATION_STATUSES.COMPLETED,
			redirectTo: accuraReturnUrl || '/login',
			accuraReturnUrl,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to activate account'),
			400,
		);
	}
}
