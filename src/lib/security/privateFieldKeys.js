import crypto from 'crypto';
import { hasRecentVerification } from '@/lib/session';
import { ROLES } from '@/lib/roles';
import { HAVENXSIG_CLIENT_ID } from '@/lib/signatura-oauth';
import {
	assertNotProviderAdminForPrivateData,
	redactForLog,
} from '@/lib/security';
import { SERVICE_ACTOR_CREDENTIAL_ID } from './zeroTrustActor';
import {
	DEFAULT_KEY_ALGORITHM,
	DEFAULT_UNLOCK_TTL_SECONDS,
	SUPPORTED_KEY_ALGORITHMS,
	SUPPORTED_PURPOSES,
	assertAllowedPurpose,
	assertNoRawKeyMaterial,
	assertCustomerUnlockRole,
	base64url,
	createKeyRef,
	hashAuthorizationToken,
	hashUnlockProof,
	normalizeWrappedKeyEnvelope,
	publicKeyMetadata,
	requireNonEmptyString,
	validateUnlockAuthorizationRecord,
	verifyUnlockProof,
} from './privateFieldKeysCore.mjs';

function assertCustomerRole(role) {
	assertNotProviderAdminForPrivateData(role);
	assertCustomerUnlockRole(role);
}

async function getIssuerMembership(prisma, userId, tenantId) {
	return prisma.issuerUser.findFirst({
		where: {
			userId,
			tenantId,
			status: 'active',
		},
		orderBy: { activatedAt: 'desc' },
	});
}

// Bind a Signatura OAuth user (HavenxSig service caller) to a HOA tenant by
// provisioning an active issuer membership on first authorized access. This is
// how tenant isolation is enforced for the bearer path: the membership is the
// durable record that this Signatura user may act for this HOA tenant.
async function ensureServiceMembership({ prisma, userId, tenantId }) {
	const existing = await getIssuerMembership(prisma, userId, tenantId);
	if (existing) return existing;

	return prisma.issuerUser.create({
		data: {
			id: crypto.randomUUID(),
			tenantId,
			userId,
			email: `${userId}@havenxsig.service`,
			role: ROLES.ISSUER_ADMIN,
			status: 'active',
			activatedAt: new Date(),
		},
	});
}

async function verifyTenantScope({
	prisma,
	session,
	role,
	tenantId,
	requireAdmin = false,
	actorSource = 'cookie',
}) {
	if (!session?.userId) throw new Error('Authentication required');
	assertCustomerRole(role);

	if (actorSource === 'bearer') {
		const normalizedTenantId = requireNonEmptyString(tenantId, 'tenantId');
		const membership = await ensureServiceMembership({
			prisma,
			userId: session.userId,
			tenantId: normalizedTenantId,
		});
		return { membership };
	}

	if ([ROLES.ISSUER_ADMIN, ROLES.ISSUER_STAFF].includes(role)) {
		const membership = await getIssuerMembership(prisma, session.userId, tenantId);
		if (!membership) throw new Error('User is not authorized for this tenant');
		if (requireAdmin && membership.role !== ROLES.ISSUER_ADMIN) {
			throw new Error('HOA administrator role required');
		}
		return { membership };
	}

	if (role === ROLES.DOCUMENT_OWNER) {
		const ownedField = await prisma.encryptedPrivateField.findFirst({
			where: {
				tenantId,
				ownerUserId: session.userId,
			},
			select: { id: true },
		});
		if (!ownedField) throw new Error('Homeowner is not authorized for this tenant');
		if (requireAdmin) throw new Error('HOA administrator role required');
		return { ownerUserId: session.userId };
	}

	throw new Error('Tenant or owner role required for private-field authorization');
}

async function requireTrustedDeviceProof({
	prisma,
	session,
	credentialId,
	actorSource = 'cookie',
}) {
	if (actorSource === 'bearer') {
		// The OAuth access token issued at Signatura login is the verification
		// factor for the service path; there is no per-request passkey/device
		// proof to check. A synthetic credential id is recorded for audit.
		return { credentialId: credentialId || SERVICE_ACTOR_CREDENTIAL_ID };
	}
	if (!hasRecentVerification(session)) {
		throw new Error('Recent passkey verification required for private-field authorization');
	}

	const normalizedCredentialId = requireNonEmptyString(
		credentialId,
		'credentialId',
	);
	const device = await prisma.trustedDevice.findFirst({
		where: {
			userId: session.userId,
			credentialId: normalizedCredentialId,
			isTrusted: true,
			removedAt: null,
		},
	});
	if (!device) throw new Error('Trusted device proof required');
	return device;
}

async function enrollPrivateFieldKeyReference({
	prisma,
	audit,
	session,
	role,
	tenantId,
	hoaId = null,
	credentialId,
	envelope,
	unlockProof,
	version = 1,
	actorSource = 'cookie',
}) {
	const normalizedTenantId = requireNonEmptyString(tenantId, 'tenantId');
	const normalizedEnvelope = normalizeWrappedKeyEnvelope(envelope);
	const normalizedProofSalt = base64url(24);
	const normalizedProofHash = hashUnlockProof(unlockProof, normalizedProofSalt);

	await verifyTenantScope({
		prisma,
		session,
		role,
		tenantId: normalizedTenantId,
		requireAdmin: true,
		actorSource,
	});
	await requireTrustedDeviceProof({ prisma, session, credentialId, actorSource });

	const activeKey = await prisma.privateFieldKeyReference.findFirst({
		where: {
			tenantId: normalizedTenantId,
			status: 'active',
		},
	});
	if (activeKey) {
		try {
			verifyUnlockProof({
				unlockProof,
				unlockProofSalt: activeKey.unlockProofSalt,
				expectedHash: activeKey.unlockProofHash,
			});
		} catch {
			throw new Error(
				'HOA encryption key does not match the enrolled key reference. Import the original HOA key on this device.',
			);
		}
		return { ...publicKeyMetadata(activeKey), alreadyEnrolled: true };
	}

	const keyRef = createKeyRef(normalizedTenantId, Number(version || 1));
	const keyReference = await prisma.privateFieldKeyReference.create({
		data: {
			tenantId: normalizedTenantId,
			hoaId: hoaId || null,
			keyRef,
			algorithm: normalizedEnvelope.algorithm,
			wrappedKey: normalizedEnvelope.wrappedKey,
			salt: normalizedEnvelope.salt,
			iv: normalizedEnvelope.iv,
			tag: normalizedEnvelope.tag,
			kdfName: normalizedEnvelope.kdfName,
			kdfParams: normalizedEnvelope.kdfParams,
			unlockProofSalt: normalizedProofSalt,
			unlockProofHash: normalizedProofHash,
			version: Number(version || 1),
			status: 'active',
			createdByUserId: session.userId,
		},
	});

	await audit?.({
		tenantId: normalizedTenantId,
		userId: session.userId,
		action: 'KEY_REFERENCE_ENROLLED',
		target: keyRef,
		details: redactForLog({
			keyRef,
			hoaId,
			algorithm: normalizedEnvelope.algorithm,
			version: Number(version || 1),
		}),
	});

	return publicKeyMetadata(keyReference);
}

function purposeRequiresConsent(purpose) {
	return ['decrypt_private_record', 'export_private_data'].includes(purpose);
}

function consentScopesForPurpose(purpose) {
	if (purpose === 'decrypt_private_record') {
		return ['decrypt_private_record', 'read_encrypted_payload'];
	}
	if (purpose === 'export_private_data') {
		return ['export_private_data', 'export_payload'];
	}
	return [purpose];
}

async function requireConsentProof({
	prisma,
	session,
	consentId,
	purpose,
	actorSource = 'cookie',
}) {
	if (!purposeRequiresConsent(purpose)) return null;

	if (actorSource === 'bearer') {
		// HavenxSig records an approved OAuth consent for its client at login.
		// That standing consent is the decrypt-purpose consent proof for the
		// service path (no per-request interactive consent id is exchanged).
		const consent = await prisma.consent.findFirst({
			where: {
				userId: session.userId,
				clientId: HAVENXSIG_CLIENT_ID,
				status: 'approved',
				revokedAt: null,
			},
			orderBy: { createdAt: 'desc' },
		});
		if (!consent) throw new Error('Approved consent proof required');
		return consent;
	}

	const normalizedConsentId = requireNonEmptyString(consentId, 'consentId');
	const consent = await prisma.consent.findFirst({
		where: {
			id: normalizedConsentId,
			userId: session.userId,
			status: 'approved',
			revokedAt: null,
			scopes: { hasSome: consentScopesForPurpose(purpose) },
		},
	});
	if (!consent) throw new Error('Approved consent proof required');
	return consent;
}

async function authorizePrivateFieldAccess({
	prisma,
	audit,
	session,
	role,
	tenantId,
	hoaId = null,
	keyRef,
	purpose,
	credentialId,
	unlockProof,
	consentId,
	ttlSeconds = DEFAULT_UNLOCK_TTL_SECONDS,
	actorSource = 'cookie',
}) {
	const normalizedTenantId = requireNonEmptyString(tenantId, 'tenantId');
	const normalizedKeyRef = requireNonEmptyString(keyRef, 'keyRef');
	const normalizedPurpose = assertAllowedPurpose(purpose);

	await verifyTenantScope({
		prisma,
		session,
		role,
		tenantId: normalizedTenantId,
		requireAdmin: normalizedPurpose === 'migrate_plaintext_records',
		actorSource,
	});
	const trustedDevice = await requireTrustedDeviceProof({
		prisma,
		session,
		credentialId,
		actorSource,
	});
	let consent = null;
	if (purposeRequiresConsent(normalizedPurpose)) {
		await audit?.({
			tenantId: normalizedTenantId,
			userId: session.userId,
			action: 'CONSENT_VERIFY',
			target: normalizedKeyRef,
			details: { purpose: normalizedPurpose, consentId: consentId || null },
		});
		try {
			consent = await requireConsentProof({
				prisma,
				session,
				consentId,
				purpose: normalizedPurpose,
				actorSource,
			});
		} catch {
			await audit?.({
				tenantId: normalizedTenantId,
				userId: session.userId,
				action: 'KEY_UNLOCK_DENIED',
				target: normalizedKeyRef,
				details: { reason: 'consent_required', purpose: normalizedPurpose },
			});
			throw new Error('Approved consent proof required');
		}
		await audit?.({
			tenantId: normalizedTenantId,
			userId: session.userId,
			action: 'CONSENT_APPROVED',
			target: normalizedKeyRef,
			details: { purpose: normalizedPurpose, consentId: consent.id },
		});
	}

	await audit?.({
		tenantId: normalizedTenantId,
		userId: session.userId,
		action: 'KEY_UNLOCK_REQUEST',
		target: normalizedKeyRef,
		details: {
			purpose: normalizedPurpose,
			hoaId: hoaId || null,
			consentId: consent?.id || null,
		},
	});

	const keyReference = await prisma.privateFieldKeyReference.findFirst({
		where: {
			tenantId: normalizedTenantId,
			keyRef: normalizedKeyRef,
			status: 'active',
			...(hoaId ? { hoaId } : {}),
		},
	});
	if (!keyReference) {
		await audit?.({
			tenantId: normalizedTenantId,
			userId: session.userId,
			action: 'KEY_UNLOCK_DENIED',
			target: normalizedKeyRef,
			details: { reason: 'key_not_found', purpose: normalizedPurpose },
		});
		throw new Error('Private-field key reference not found');
	}

	try {
		verifyUnlockProof({
			unlockProof,
			unlockProofSalt: keyReference.unlockProofSalt,
			expectedHash: keyReference.unlockProofHash,
		});
	} catch {
		await audit?.({
			tenantId: normalizedTenantId,
			userId: session.userId,
			action: 'KEY_UNLOCK_DENIED',
			target: normalizedKeyRef,
			details: { reason: 'invalid_customer_proof', purpose: normalizedPurpose },
		});
		throw new Error('Private-field authorization proof rejected');
	}

	const authorizationToken = `ckauth_${base64url(32)}`;
	const expiresAt = new Date(
		Date.now() + Math.max(30, Math.min(Number(ttlSeconds), 900)) * 1000,
	);
	await prisma.privateFieldKeyAuthorization.create({
		data: {
			tenantId: normalizedTenantId,
			hoaId: keyReference.hoaId || hoaId || null,
			keyRef: normalizedKeyRef,
			userId: session.userId,
			credentialId: trustedDevice.credentialId || credentialId,
			purpose: normalizedPurpose,
			authorizationHash: hashAuthorizationToken(authorizationToken),
			status: 'authorized',
			expiresAt,
		},
	});

	await audit?.({
		tenantId: normalizedTenantId,
		userId: session.userId,
		action: 'KEY_UNLOCK_APPROVED',
		target: normalizedKeyRef,
		details: {
			purpose: normalizedPurpose,
			hoaId: keyReference.hoaId || null,
			consentId: consent?.id || null,
		},
	});

	return {
		authorizationToken,
		expiresAt,
		key: publicKeyMetadata(keyReference),
	};
}

async function validateUnlockAuthorization({
	prisma,
	audit,
	session,
	role,
	tenantId,
	hoaId = null,
	keyRef,
	purpose,
	authorizationToken,
	consume = true,
	actorSource = 'cookie',
}) {
	const normalizedTenantId = requireNonEmptyString(tenantId, 'tenantId');
	const normalizedKeyRef = requireNonEmptyString(keyRef, 'keyRef');
	const normalizedPurpose = assertAllowedPurpose(purpose);
	const normalizedAuthorizationToken = requireNonEmptyString(
		authorizationToken,
		'authorizationToken',
	);

	await verifyTenantScope({
		prisma,
		session,
		role,
		tenantId: normalizedTenantId,
		requireAdmin: normalizedPurpose === 'migrate_plaintext_records',
		actorSource,
	});

	const authorization = await prisma.privateFieldKeyAuthorization.findFirst({
		where: {
			tenantId: normalizedTenantId,
			keyRef: normalizedKeyRef,
			userId: session.userId,
			purpose: normalizedPurpose,
			authorizationHash: hashAuthorizationToken(normalizedAuthorizationToken),
			status: 'authorized',
			consumedAt: null,
			expiresAt: { gt: new Date() },
			...(hoaId ? { hoaId } : {}),
		},
	});

	if (!authorization) {
		await audit?.({
			tenantId: normalizedTenantId,
			userId: session.userId,
			action: 'KEY_UNLOCK_DENIED',
			target: normalizedKeyRef,
			details: { purpose: normalizedPurpose, reason: 'missing_or_expired' },
		});
		throw new Error('Valid private-field authorization required');
	}
	validateUnlockAuthorizationRecord({
		authorization,
		tenantId: normalizedTenantId,
		keyRef: normalizedKeyRef,
		userId: session.userId,
		purpose: normalizedPurpose,
		authorizationToken: normalizedAuthorizationToken,
	});

	if (consume) {
		const result = await prisma.privateFieldKeyAuthorization.updateMany({
			where: {
				id: authorization.id,
				status: 'authorized',
				consumedAt: null,
			},
			data: {
				status: 'consumed',
				consumedAt: new Date(),
			},
		});
		if (result.count !== 1) {
			throw new Error('Private-field authorization was already consumed');
		}
	}

	await audit?.({
		tenantId: normalizedTenantId,
		userId: session.userId,
		action: consume
			? 'KEY_UNLOCK_AUTHORIZATION_CONSUMED'
			: 'KEY_UNLOCK_AUTHORIZATION_VERIFIED',
		target: normalizedKeyRef,
		details: { purpose: normalizedPurpose },
	});

	return authorization;
}

export {
	DEFAULT_KEY_ALGORITHM,
	DEFAULT_UNLOCK_TTL_SECONDS,
	SUPPORTED_KEY_ALGORITHMS,
	SUPPORTED_PURPOSES,
	assertNoRawKeyMaterial,
	authorizePrivateFieldAccess,
	createKeyRef,
	enrollPrivateFieldKeyReference,
	hashAuthorizationToken,
	hashUnlockProof,
	normalizeWrappedKeyEnvelope,
	requireConsentProof,
	publicKeyMetadata,
	validateUnlockAuthorization,
	verifyTenantScope,
};
