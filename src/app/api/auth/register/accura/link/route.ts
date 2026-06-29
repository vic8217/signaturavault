import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	ACCURA_ONBOARDING_ACTIONS,
	auditAccuraOnboardingEvent,
} from '@/lib/accuraOnboardingAudit';
import {
	buildAccuraRegistrationReturnUrl,
	notifyAccuraRegistrationCallback,
	verifyAccuraRegistrationHandoffToken,
} from '@/lib/accuraRegistrationHandoff';
import { userPublicIdentity } from '@/lib/identity';
import { sourceAppLabel } from '@/lib/registrationSource';
import { ensureAccuraMembershipRole } from '@/lib/universalIdentity';
import {
	assertSecureWebAuthnRequest,
	getOrigin,
	getRpID,
	getUserAgent,
	logSecurityEvent,
} from '@/lib/webauthn';

function signaturaAppLinkModel(client = prisma) {
	return (
		client as unknown as {
			signaturaAppLink?: {
				findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
				update: (args: Record<string, unknown>) => Promise<unknown>;
				create: (args: Record<string, unknown>) => Promise<unknown>;
			};
		}
	).signaturaAppLink;
}

function accuraRegistrationHandoffModel(client = prisma) {
	return (
		client as unknown as {
			accuraRegistrationHandoff?: {
				findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
				create: (args: Record<string, unknown>) => Promise<unknown>;
				updateMany: (args: Record<string, unknown>) => Promise<{ count: number }>;
			};
		}
	).accuraRegistrationHandoff;
}

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json().catch(() => ({}));
		const handoffToken = String(body.accuraHandoffToken || body.handoffToken || '').trim();
		const signaturaId = String(body.signaturaId || '').trim().toUpperCase();
		const assertion = body.response || body.assertion || null;

		if (!handoffToken) {
			return jsonError('ACCURA registration handoff token is required', 400);
		}
		if (!signaturaId || !assertion) {
			return jsonError('Signatura ID and passkey approval are required', 400);
		}

		const handoff = verifyAccuraRegistrationHandoffToken(handoffToken);
		if (!handoff.valid || !handoff.context) {
			await auditAccuraOnboardingEvent({
				req,
				action: ACCURA_ONBOARDING_ACTIONS.REQUEST_FAILED,
				result: 'failed',
				context: handoff.context || {},
				details: {
					reason: handoff.reason || handoff.error || 'invalid_handoff',
					mode: 'link',
				},
			});
			return jsonError(
				handoff.error ||
					'ACCURA registration session expired. Please ask your Company Admin to generate a new registration key.',
				400,
			);
		}

		const context = handoff.context;
		if (context.linkSignaturaId && context.linkSignaturaId !== signaturaId) {
			return jsonError('Passkey approval does not match the requested Signatura ID', 403);
		}

		const user = await prisma.user.findUnique({
			where: { signaturaId },
			select: {
				id: true,
				signaturaId: true,
				accountStatus: true,
				trustLevel: true,
			},
		});
		if (!user || user.accountStatus !== 'active') {
			return jsonError('Signatura account must be active before linking to ACCURA', 409);
		}

		const challenge = await prisma.authChallenge.findFirst({
			where: {
				userId: user.id,
				type: 'LOGIN_PASSKEY',
				usedAt: null,
				expiresAt: { gt: new Date() },
			},
			orderBy: { createdAt: 'desc' },
		});
		if (!challenge) {
			return jsonError('Passkey login challenge expired. Start again.', 401);
		}

		const credential = await prisma.webAuthnCredential.findFirst({
			where: {
				userId: user.id,
				credentialId: String(assertion?.id || ''),
			},
			include: { user: true },
		});
		if (!credential) {
			return jsonError('No passkey is registered for this account', 401);
		}

		const verification = await verifyAuthenticationResponse({
			response: assertion,
			expectedChallenge: challenge.challenge,
			expectedOrigin: getOrigin(req),
			expectedRPID: getRpID(req),
			credential: {
				id: credential.credentialId,
				publicKey: credential.publicKey,
				counter: credential.counter,
				transports: credential.transports,
			},
		});
		if (!verification.verified) {
			return jsonError('Passkey approval could not be verified', 401);
		}

		const appLinkModel = signaturaAppLinkModel();
		const handoffModel = accuraRegistrationHandoffModel();
		const existingHandoff = handoffModel
			? await handoffModel.findFirst({
					where: { tokenId: context.jti },
				})
			: null;
		if (
			existingHandoff &&
			!['CLAIMED'].includes(String(existingHandoff.status || '').toUpperCase())
		) {
			return jsonError('This ACCURA registration handoff was already used.', 409);
		}
		const existingLink = appLinkModel
			? await appLinkModel.findFirst({
					where: {
						userId: user.id,
						sourceApp: 'ACCURA',
						companyCode: context.companyCode,
						rolePrefix: context.roleCode,
						status: 'ACTIVE',
					},
					orderBy: { createdAt: 'desc' },
				})
			: null;

		const linkedSignaturaId = user.signaturaId;
		const accuraReturnUrl =
			buildAccuraRegistrationReturnUrl(context.returnUrl, {
				signaturaId: linkedSignaturaId,
				userId: user.id,
				signaturaSubjectId: user.id,
				companyId: context.companyId,
				companyCode: context.companyCode,
				roleCode: context.roleCode,
				rolePrefix: context.roleCode,
				registrationKeyId: context.registrationKeyId,
				registrationStatus: 'LINKED',
				requestId: context.requestId,
				state: context.state,
				nonce: context.nonce,
			}) || '';
		let verificationToken = '';
		if (accuraReturnUrl) {
			try {
				verificationToken =
					new URL(accuraReturnUrl).searchParams.get('authorizationCode') || '';
			} catch {
				verificationToken = '';
			}
		}

		await prisma.$transaction(async (tx) => {
			const transactionHandoffModel = accuraRegistrationHandoffModel(tx);
			if (transactionHandoffModel) {
				if (existingHandoff) {
					const claimed = await transactionHandoffModel.updateMany({
						where: {
							tokenId: context.jti,
							status: 'CLAIMED',
						},
						data: { status: 'PROCESSING' },
					});
					if (claimed.count !== 1) {
						const error = new Error(
							'This ACCURA registration handoff was already used.',
						);
						(error as Error & { status?: number }).status = 409;
						throw error;
					}
				} else {
					await transactionHandoffModel.create({
						data: {
							id: crypto.randomUUID(),
							tokenId: context.jti,
							challengeId: context.challengeId || context.requestId,
							registrationKeyId: context.registrationKeyId,
							companyId: context.companyId,
							companyCode: context.companyCode,
							roleCode: context.roleCode,
							returnUrl: context.returnUrl,
							originDevice: context.originDevice || 'desktop',
							flowType: context.flowType || 'cross_device_qr',
							status: 'PROCESSING',
							userId: user.id,
							signaturaId: linkedSignaturaId,
							expiresAt: new Date(context.expiresAt),
						},
					});
				}
			}

			await tx.authChallenge.update({
				where: { id: challenge.id },
				data: { usedAt: new Date() },
			});
			await tx.webAuthnCredential.update({
				where: { id: credential.id },
				data: {
					counter: verification.authenticationInfo.newCounter,
					lastUsedAt: new Date(),
				},
			});

			const linkModel = signaturaAppLinkModel(tx);
			const registrationContext = {
				sourceApp: 'accura',
				accuraCompanyId: context.companyId,
				accuraCompanyCode: context.companyCode,
				accuraRoleCode: context.roleCode,
				accuraRoleName: context.roleName,
				accuraRegistrationKeyId: context.registrationKeyId,
				returnUrl: context.returnUrl,
				handoffTokenId: context.jti,
				challengeId: context.challengeId,
				requestId: context.requestId,
				originDevice: context.originDevice,
				flowType: context.flowType,
				state: context.state,
				nonce: context.nonce,
				linkedAt: new Date().toISOString(),
				masterSignaturaId: user.signaturaId,
			};

			if (existingLink && linkModel) {
				await linkModel.update({
					where: { id: existingLink.id },
					data: {
						signaturaId: linkedSignaturaId,
						registrationContext,
						trustedDeviceStatus: 'TRUSTED',
					},
				});
			} else if (linkModel) {
				await linkModel.create({
					data: {
						id: crypto.randomUUID(),
						userId: user.id,
						signaturaId: linkedSignaturaId,
						sourceApp: sourceAppLabel('accura'),
						companyCode: context.companyCode,
						companyName: context.companyName,
						companyId: context.companyId,
						tenantId: context.companyId,
						role: context.roleName,
						rolePrefix: context.roleCode,
						registrationContext,
						trustedDeviceStatus: 'TRUSTED',
						status: 'ACTIVE',
					},
				});
			}

			await ensureAccuraMembershipRole(tx, {
				identityId: user.id,
				companyId: context.companyId,
				companyCode: context.companyCode,
				companyName: context.companyName,
				rolePrefix: context.roleCode,
				roleName: context.roleName,
			});

			await transactionHandoffModel?.updateMany({
				where: {
					tokenId: context.jti,
					status: 'PROCESSING',
				},
				data: {
					status: 'APPROVED',
					approvedAt: new Date(),
					completedAt: new Date(),
					userId: user.id,
					signaturaId: linkedSignaturaId,
					verificationToken,
				},
			});
		});

		await auditAccuraOnboardingEvent({
			req,
			action: ACCURA_ONBOARDING_ACTIONS.ID_LINKED,
			userId: user.id,
			context,
			details: {
				signaturaId: linkedSignaturaId,
				masterSignaturaId: user.signaturaId,
			},
		});
		await auditAccuraOnboardingEvent({
			req,
			action: ACCURA_ONBOARDING_ACTIONS.REDIRECT_ISSUED,
			userId: user.id,
			context,
			details: {
				signaturaId: linkedSignaturaId,
				masterSignaturaId: user.signaturaId,
				accuraReturnUrl,
			},
		});
		await logSecurityEvent(req, 'accura_signatura_id_linked', user.id, {
			companyCode: context.companyCode,
			rolePrefix: context.roleCode,
			registrationKeyId: context.registrationKeyId,
		});

		const isCrossDeviceQr = context.flowType !== 'same_device_deeplink';
		if (accuraReturnUrl && !isCrossDeviceQr) {
			await notifyAccuraRegistrationCallback(accuraReturnUrl).catch(() => null);
		}

		return NextResponse.json({
			ok: true,
			user: userPublicIdentity(user),
			status: 'APPROVED',
			challengeId: context.challengeId || context.requestId,
			verificationToken,
			flowType: context.flowType,
			originDevice: context.originDevice,
			accuraReturnUrl: isCrossDeviceQr ? '' : accuraReturnUrl,
			redirectTo: isCrossDeviceQr ? '' : accuraReturnUrl,
			message: isCrossDeviceQr
				? 'Approved successfully. You may return to the original ACCURA browser window.'
				: 'Approved successfully. Returning to ACCURA.',
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to link ACCURA Signatura ID'),
			(error as Error & { status?: number }).status ?? 400,
		);
	}
}
