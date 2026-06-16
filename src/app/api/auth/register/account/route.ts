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
import {
	normalizeAccuraRole,
	normalizeAccuraRolePrefix,
	normalizeCompanyCode,
	normalizeCompanyName,
	normalizeRegistrationSource,
	sourceAppLabel,
	validateAccuraRegistrationContext,
} from '@/lib/registrationSource';
import { loadDb, saveDb } from '@/lib/db';
import { ROLES } from '@/lib/roles';
import { registrationSessionExpiresAt } from '@/lib/registration-session';
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

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json().catch(() => ({}));
		const fullName = normalizeFullName(body.fullName);
		const handphone = normalizeHandphone(body.handphone);
		const email = normalizeEmail(body.email);
		const accountType = normalizeSignaturaAccountType(body.accountType);
		const authorizationCode = String(body.authorizationCode || '').trim();
		const registrationSource = normalizeRegistrationSource(body.source);
		const companyCode = normalizeCompanyCode(body.companyCode);
		const companyName = normalizeCompanyName(body.companyName);
		const role = normalizeAccuraRole(body.role);
		const rolePrefix = normalizeAccuraRolePrefix(body.rolePrefix);
		const returnUrl = normalizeExternalReturnUrl(body.returnUrl);
		const registrationContext = {
			source: registrationSource.source,
			companyCode,
			companyName,
			role,
			rolePrefix,
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
		const matchingContactUsers = await prisma.user.findMany({
			where: {
				OR: [{ emailLookupHash }, { mobileLookupHash }],
			},
			select: { id: true, signaturaId: true },
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
								companyCode: rolePrefix === 'SADM' ? null : companyCode,
								rolePrefix,
								status: 'ACTIVE',
							},
							orderBy: { createdAt: 'desc' },
						})
					: null;

			if (existingAccuraLink) {
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
		} else {
			const existing = matchingContactUsers.find(
				(user) => getSignaturaAccountType(user.signaturaId) === accountType,
			);
			if (existing) {
				return jsonError('Account already exists', 409);
			}
		}

		const userId = crypto.randomUUID();
		const signaturaId =
			isAccuraRegistration
				? await createUniqueAccuraSignaturaId(prisma, companyCode, rolePrefix)
					: await createUniqueSignaturaId(prisma, accountType);
			const registrationToken = crypto.randomBytes(32).toString('base64url');
			const registrationSessionId = crypto.randomUUID();
			const encryptedFields = encryptedAccountContactFields({
			userId,
			fullName,
			handphone,
			email,
		});

		const user = await prisma.$transaction(async (tx) => {
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
							signaturaId,
							sourceApp: sourceAppLabel(registrationSource.source),
							companyCode:
								isAccuraRegistration && rolePrefix !== 'SADM'
									? companyCode
									: null,
							companyName:
								isAccuraRegistration && rolePrefix !== 'SADM'
									? companyName
									: null,
							role: isAccuraRegistration ? role : null,
							rolePrefix: isAccuraRegistration ? rolePrefix : null,
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
					isAccuraRegistration && rolePrefix !== 'SADM'
						? companyCode
						: null,
				role: isAccuraRegistration ? role : null,
				rolePrefix: isAccuraRegistration ? rolePrefix : null,
			fields: ['full_name', 'handphone', 'email'],
			plaintextStored: false,
		});

		return Response.json({
				ok: true,
				user: userPublicIdentity(user),
				registrationToken,
				registrationSessionId,
			});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to create account'),
			400,
		);
	}
}
