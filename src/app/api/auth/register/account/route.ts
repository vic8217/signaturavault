import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	SIGNATURA_ACCOUNT_TYPES,
	createUniqueAccuraSignaturaId,
	createUniqueSignaturaId,
	getSignaturaAccountType,
	normalizeSignaturaAccountType,
	userPublicIdentity,
} from '@/lib/identity';
import {
	accountLookupHashes,
	encryptedAccountContactFields,
	ensureAccountPrivateFieldKeyReference,
	normalizeEmail,
	normalizeFullName,
	normalizeHandphone,
} from '@/lib/account-private-fields';
import { verifyIssuerAuthorizationCode } from '@/lib/issuer-authorization';
import { normalizeExternalReturnUrl } from '@/lib/externalReturnUrl';
import { verifyAccuraRegistrationHandoffToken } from '@/lib/accuraRegistrationHandoff';
import {
	ACCURA_ONBOARDING_ACTIONS,
	auditAccuraOnboardingEvent,
} from '@/lib/accuraOnboardingAudit';
import {
	normalizeAccuraRole,
	normalizeAccuraRolePrefix,
	normalizeCompanyCode,
	normalizeCompanyId,
	normalizeCompanyName,
	normalizeRegistrationSource,
	sourceAppLabel,
	validateAccuraRegistrationContext,
} from '@/lib/registrationSource';
import { loadDb, saveDb } from '@/lib/db';
import { ROLES } from '@/lib/roles';
import { registrationSessionExpiresAt } from '@/lib/registration-session';
import {
	currentRegistrationStep,
	REGISTRATION_STATUSES,
} from '@/lib/registration-status';
import {
	assertSecureWebAuthnRequest,
	getUserAgent,
	logSecurityEvent,
} from '@/lib/webauthn';

function validateEmail(email: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function signaturaAppLinkModel() {
	return (prisma as unknown as { signaturaAppLink?: typeof prisma.signaturaAppLink })
		.signaturaAppLink;
}

function accuraRegistrationHandoffModel(client = prisma) {
	return (
		client as unknown as {
			accuraRegistrationHandoff?: {
				create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
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
		const fullName = normalizeFullName(body.fullName);
		const handphone = normalizeHandphone(body.handphone);
		const email = normalizeEmail(body.email);
		const accountType = normalizeSignaturaAccountType(body.accountType);
		const authorizationCode = String(body.authorizationCode || '').trim();
		const handoffToken = String(body.accuraHandoffToken || body.handoffToken || '').trim();
		let registrationSource = normalizeRegistrationSource(body.source);
		let companyId = normalizeCompanyId(body.companyId);
		let companyCode = normalizeCompanyCode(body.companyCode);
		let companyName = normalizeCompanyName(body.companyName);
		let role = normalizeAccuraRole(body.role);
		let roleName = String(body.roleName || body.role || '').trim().slice(0, 120);
		let rolePrefix = normalizeAccuraRolePrefix(body.rolePrefix);
		let registrationKeyId = String(body.registrationKeyId || '').trim();
		let tokenId = '';
		let returnUrl = normalizeExternalReturnUrl(body.returnUrl);
		let accuraHandoffExpiresAt = '';
		let accuraRequestId = '';
		let accuraState = '';
		let accuraNonce = '';
		let accuraClientId = 'accura';

		if (registrationSource.source === 'accura' || handoffToken) {
			if (!handoffToken) {
				return jsonError(
					'ACCURA registration session expired. Please ask your Company Admin to generate a new registration key.',
					400,
				);
			}
			const handoff = verifyAccuraRegistrationHandoffToken(handoffToken);
			if (!handoff.valid) {
				await auditAccuraOnboardingEvent({
					req,
					action: ACCURA_ONBOARDING_ACTIONS.REQUEST_FAILED,
					result: 'failed',
					context: handoff.context || {},
					details: {
						reason: handoff.reason || handoff.error || 'invalid_handoff',
					},
				});
				return jsonError(
					handoff.error ||
						'ACCURA registration session expired. Please ask your Company Admin to generate a new registration key.',
					400,
				);
			}
			const context = handoff.context;
			registrationSource = { source: 'accura', error: '' };
			companyId = context.companyId;
			companyCode = context.companyCode;
			companyName = context.companyName;
			role = normalizeAccuraRole(context.roleName);
			roleName = context.roleName;
			rolePrefix = context.roleCode;
			registrationKeyId = context.registrationKeyId;
			tokenId = context.jti;
			returnUrl = context.returnUrl;
			accuraHandoffExpiresAt = context.expiresAt;
			accuraRequestId = context.requestId;
			accuraState = context.state;
			accuraNonce = context.nonce;
			accuraClientId = context.clientId;
			await auditAccuraOnboardingEvent({
				req,
				action: ACCURA_ONBOARDING_ACTIONS.REQUEST_RECEIVED,
				context,
				details: { endpoint: '/api/auth/register/account' },
			});
			if (context.mode === 'link') {
				return jsonError(
					'This ACCURA invitation is for linking an existing Signatura ID. Approve with your trusted device passkey instead.',
					409,
				);
			}
		}

		const registrationContext = {
			source: registrationSource.source,
			companyId,
			companyCode,
			companyName,
			role,
			rolePrefix,
			registrationKeyId,
			tokenId,
		};

		if (!fullName || fullName.length < 2) return jsonError('Full name is required');
		if (!handphone || handphone.replace(/\D/g, '').length < 7) {
			return jsonError('Handphone number is required');
		}
		if (!email || !validateEmail(email)) return jsonError('Valid email address is required');
		if (registrationSource.error) {
			return jsonError(registrationSource.error, 400);
		}
		const accuraContextError = validateAccuraRegistrationContext(
			registrationContext,
			{ returnUrl },
		);
		if (accuraContextError) {
			return jsonError(accuraContextError, 400);
		}
		let issuerAuthorizationRecord = null;

		if (accountType === SIGNATURA_ACCOUNT_TYPES.ISSUER) {
			issuerAuthorizationRecord = await verifyIssuerAuthorizationCode(authorizationCode);
			const generatedCodeIsValid = Boolean(issuerAuthorizationRecord);
			const expectedAuthorizationCode =
				process.env.ISSUER_CREATION_AUTH_CODE ||
				process.env.ISSUER_SIGNATURA_ID_AUTH_CODE;
			let envCodeIsValid = false;

			if (expectedAuthorizationCode) {
				const providedBuffer = Buffer.from(authorizationCode);
				const expectedBuffer = Buffer.from(expectedAuthorizationCode);
				if (providedBuffer.length === expectedBuffer.length) {
					try {
						envCodeIsValid = crypto.timingSafeEqual(
							providedBuffer,
							expectedBuffer,
						);
					} catch {
						envCodeIsValid = false;
					}
				}
			}

			if (!generatedCodeIsValid && !envCodeIsValid) {
				return jsonError('Invalid issuer authorization code', 403);
			}
		}
		if (
			accountType === SIGNATURA_ACCOUNT_TYPES.ADMIN &&
			process.env.NODE_ENV === 'production'
		) {
			return jsonError('Admin Signatura IDs must be provisioned internally', 403);
		}

		const { emailLookupHash, mobileLookupHash } = accountLookupHashes({
			email,
			handphone,
		});
		const isAccuraRegistration = registrationSource.source === 'accura';
		if (isAccuraRegistration && !tokenId) {
			return jsonError(
				'ACCURA registration session expired. Please ask your Company Admin to generate a new registration key.',
				400,
			);
		}
		const matchingContactUsers = await prisma.user.findMany({
			where: {
				OR: [{ emailLookupHash }, { mobileLookupHash }],
			},
			select: {
				id: true,
				signaturaId: true,
				accountStatus: true,
				trustLevel: true,
			},
		});
		if (isAccuraRegistration) {
			const appLinkModel = signaturaAppLinkModel();
			const matchingContactUserIds = matchingContactUsers.map((user) => user.id);
			const existingAccuraLink =
				appLinkModel && matchingContactUserIds.length
					? await appLinkModel.findFirst({
							where: {
								userId: { in: matchingContactUserIds },
								sourceApp: 'ACCURA',
								companyCode,
								rolePrefix,
								status: 'ACTIVE',
							},
							orderBy: { createdAt: 'desc' },
						})
					: null;

			if (existingAccuraLink) {
				await auditAccuraOnboardingEvent({
					req,
					action: ACCURA_ONBOARDING_ACTIONS.ID_LINKED,
					userId: existingAccuraLink.userId as string,
					context: {
						companyId,
						companyCode,
						rolePrefix,
						registrationKeyId,
						requestId: tokenId,
					},
					details: {
						signaturaId: existingAccuraLink.signaturaId,
						alreadyLinked: true,
					},
				});
				return NextResponse.json(
					{
						error: 'ACCURA company-role Signatura ID already exists',
						existingSignaturaId: existingAccuraLink.signaturaId,
						source: 'accura',
						companyCode: existingAccuraLink.companyCode || companyCode,
						companyName: existingAccuraLink.companyName || companyName,
						role: existingAccuraLink.role || role,
						rolePrefix: existingAccuraLink.rolePrefix || rolePrefix,
						linkedToCompany: true,
					},
					{ status: 409 },
				);
			}
			const existingIdentity =
				matchingContactUsers.find(
					(user) => !user.signaturaId.startsWith('SIG-ACCURA-'),
				) || matchingContactUsers[0];
			if (existingIdentity) {
				return NextResponse.json(
					{
						error:
							'An existing Signatura identity matches these contact details. Approve biometric linking to add this ACCURA role.',
						existingSignaturaId: existingIdentity.signaturaId,
						source: 'accura',
						companyCode,
						companyName,
						role,
						rolePrefix,
						linkedToCompany: false,
						linkRequired: true,
					},
					{ status: 409 },
				);
			}
		} else {
			const existing = matchingContactUsers.find(
				(user) => getSignaturaAccountType(user.signaturaId) === accountType,
			);
			if (existing) {
				const setupStep = currentRegistrationStep(existing);
				const setupIncomplete =
					setupStep !== REGISTRATION_STATUSES.COMPLETED &&
					existing.accountStatus !== 'active';
				return NextResponse.json(
					{
						error: 'Account already exists',
						existingSignaturaId: existing.signaturaId,
						setupIncomplete,
					},
					{ status: 409 },
				);
			}
		}

		const userId = crypto.randomUUID();
		const signaturaId = await createUniqueSignaturaId(prisma, accountType);
		const accuraRoleSignaturaId = isAccuraRegistration
			? await createUniqueAccuraSignaturaId(prisma, companyCode, rolePrefix)
			: null;
		const registrationToken = crypto.randomBytes(32).toString('base64url');
		const registrationSessionId = crypto.randomUUID();
		const encryptedFields = encryptedAccountContactFields({
			userId,
			fullName,
			handphone,
			email,
		});

		const user = await prisma.$transaction(async (tx) => {
			const handoffModel = accuraRegistrationHandoffModel(tx);
			if (isAccuraRegistration && handoffModel) {
				try {
					await handoffModel.create({
						data: {
							id: crypto.randomUUID(),
							tokenId,
							registrationKeyId,
							companyId,
							companyCode,
							roleCode: rolePrefix,
							returnUrl,
							status: 'CLAIMED',
							userId,
							signaturaId: accuraRoleSignaturaId || signaturaId,
							expiresAt: new Date(accuraHandoffExpiresAt),
						},
					});
				} catch {
					const error = new Error('ACCURA registration handoff was already used.');
					(error as Error & { status?: number }).status = 409;
					throw error;
				}
			}

			const created = await tx.user.create({
				data: {
					id: userId,
					signaturaId,
					email: null,
					name: null,
					emailLookupHash,
					mobileLookupHash,
					accountStatus: 'pending_passkey_creation',
					trustLevel: 1,
				},
			});
			await ensureAccountPrivateFieldKeyReference(tx, userId);
			await tx.encryptedPrivateField.createMany({ data: encryptedFields });
			await tx.authChallenge.create({
				data: {
					id: registrationSessionId,
					userId,
					type: 'REGISTER_ACCOUNT',
					challenge: registrationToken,
					userAgent: getUserAgent(req),
					expiresAt: registrationSessionExpiresAt(),
				},
			});

			const appLinkModel = (tx as unknown as { signaturaAppLink?: typeof tx.signaturaAppLink })
				.signaturaAppLink;
			if (registrationSource.source && appLinkModel) {
				await appLinkModel.create({
					data: {
						id: crypto.randomUUID(),
						userId,
						signaturaId: accuraRoleSignaturaId || signaturaId,
						sourceApp: sourceAppLabel(registrationSource.source),
						companyCode: isAccuraRegistration ? companyCode : null,
						companyName: isAccuraRegistration ? companyName : null,
						companyId: isAccuraRegistration ? companyId : null,
						tenantId: isAccuraRegistration ? companyId : null,
						role: isAccuraRegistration ? role : null,
						rolePrefix: isAccuraRegistration ? rolePrefix : null,
						registrationContext: isAccuraRegistration
							? {
									sourceApp: 'accura',
									accuraCompanyId: companyId,
									accuraCompanyCode: companyCode,
									accuraRoleCode: rolePrefix,
									accuraRoleName: roleName,
									accuraRegistrationKeyId: registrationKeyId,
									returnUrl,
									handoffTokenId: tokenId,
									requestId: accuraRequestId || tokenId,
									state: accuraState,
									nonce: accuraNonce,
									clientId: accuraClientId,
									registeredAt: new Date().toISOString(),
									masterSignaturaId: signaturaId,
								}
							: null,
						trustedDeviceStatus: isAccuraRegistration ? 'PENDING' : null,
						status: 'ACTIVE',
					},
				});
			}

			if (
				accountType === SIGNATURA_ACCOUNT_TYPES.ISSUER &&
				issuerAuthorizationRecord &&
				issuerAuthorizationRecord.issuerId &&
				issuerAuthorizationRecord.tenantId
			) {
				await tx.issuerUser.create({
					data: {
						id: crypto.randomUUID(),
						tenantId: issuerAuthorizationRecord.tenantId,
						issuerId: issuerAuthorizationRecord.issuerId,
						userId,
						email,
						role: ROLES.ISSUER_ADMIN,
						status: 'active',
						invitedAt: new Date(),
						activatedAt: new Date(),
					},
				});
			}

			return created;
		});

		if (
			accountType === SIGNATURA_ACCOUNT_TYPES.ISSUER &&
			issuerAuthorizationRecord &&
			issuerAuthorizationRecord.id
		) {
			const db = await loadDb();
			const records = Array.isArray(db.issuer_authorization_codes)
				? db.issuer_authorization_codes
				: [];
			const recordIndex = records.findIndex(
				(item) => item.id === issuerAuthorizationRecord.id,
			);
			if (recordIndex >= 0) {
				records[recordIndex] = {
					...records[recordIndex],
					status: 'used',
					usedAt: new Date().toISOString(),
				};
				db.issuer_authorization_codes = records;
				await saveDb(db);
			}
		}

		await logSecurityEvent(req, 'account_created_private_fields_encrypted', user.id, {
			signaturaId: user.signaturaId,
				accountType,
				sourceApp: sourceAppLabel(registrationSource.source) || null,
				companyCode:
					isAccuraRegistration
						? companyCode
						: null,
				companyId: isAccuraRegistration ? companyId : null,
				role: isAccuraRegistration ? role : null,
				rolePrefix: isAccuraRegistration ? rolePrefix : null,
				registrationKeyId: isAccuraRegistration ? registrationKeyId : null,
			fields: ['full_name', 'handphone', 'email'],
			plaintextStored: false,
		});
		if (isAccuraRegistration) {
			await auditAccuraOnboardingEvent({
				req,
				action: ACCURA_ONBOARDING_ACTIONS.ID_CREATED,
				userId: user.id,
				context: {
					companyId,
					companyCode,
					rolePrefix,
					registrationKeyId,
					requestId: accuraRequestId || tokenId,
					state: accuraState,
					nonce: accuraNonce,
					clientId: accuraClientId,
				},
				details: {
					signaturaId: accuraRoleSignaturaId || user.signaturaId,
					masterSignaturaId: user.signaturaId,
				},
			});
		}

		return Response.json({
			ok: true,
			user: userPublicIdentity(user),
			registrationToken,
			registrationSessionId,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to create account'),
			(error as Error & { status?: number }).status ?? 400,
		);
	}
}
