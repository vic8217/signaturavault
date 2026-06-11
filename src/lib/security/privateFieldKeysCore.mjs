import crypto from 'crypto';

const DEFAULT_KEY_ALGORITHM = 'AES-256-GCM';
const DEFAULT_UNLOCK_TTL_SECONDS = 5 * 60;
const SUPPORTED_KEY_ALGORITHMS = new Set([DEFAULT_KEY_ALGORITHM]);
const KEY_ALGORITHM_ALIASES = new Map([['AES-GCM-256', DEFAULT_KEY_ALGORITHM]]);
const SUPPORTED_PURPOSES = new Set([
	'decrypt_private_record',
	'encrypt_private_record',
	'export_private_data',
	'migrate_plaintext_records',
	'read_encrypted_payload',
	'encrypt_payload',
	'export_payload',
]);
const PURPOSE_ALIASES = new Map([
	['read_encrypted_payload', 'decrypt_private_record'],
	['authorize_decrypt', 'decrypt_private_record'],
	['encrypt_payload', 'encrypt_private_record'],
	['export_payload', 'export_private_data'],
]);
const SCRYPT_UNLOCK_PARAMS = {
	cost: 32768,
	blockSize: 8,
	parallelization: 1,
	keyLength: 32,
};
const CUSTOMER_UNLOCK_ROLES = new Set([
	'ISSUER_ADMIN',
	'ISSUER_STAFF',
	'DOCUMENT_OWNER',
]);
const PROVIDER_ADMIN_ROLES = new Set([
	'SIGNATURA_ADMIN',
	'SIGNATURA_STAFF',
	'DEV_ADMIN',
	'SUPER_ADMIN',
]);

const RAW_KEY_FIELD_PATTERN =
	/(^|_)(raw|plain|plaintext)?(customer|tenant|hoa|data)?(key|secret|passphrase|password)(_|$)/i;

function base64url(bytes = 32) {
	return crypto.randomBytes(bytes).toString('base64url');
}

function createKeyRef(tenantId, version = 1) {
	return `ztpf_${tenantId}_${version}_${base64url(12)}`;
}

function hashUnlockProof(unlockProof, salt) {
	const normalizedProof = requireNonEmptyString(unlockProof, 'unlockProof');
	const normalizedSalt = requireNonEmptyString(salt, 'unlockProofSalt');
	const key = crypto.scryptSync(normalizedProof, normalizedSalt, SCRYPT_UNLOCK_PARAMS.keyLength, {
		N: SCRYPT_UNLOCK_PARAMS.cost,
		r: SCRYPT_UNLOCK_PARAMS.blockSize,
		p: SCRYPT_UNLOCK_PARAMS.parallelization,
		maxmem: 64 * 1024 * 1024,
	});

	return [
		'scrypt',
		SCRYPT_UNLOCK_PARAMS.cost,
		SCRYPT_UNLOCK_PARAMS.blockSize,
		SCRYPT_UNLOCK_PARAMS.parallelization,
		normalizedSalt,
		key.toString('hex'),
	].join('$');
}

function hashAuthorizationToken(token) {
	return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function assertNoRawKeyMaterial(input, path = '') {
	if (!input || typeof input !== 'object') return;

	for (const [key, value] of Object.entries(input)) {
		const fieldPath = path ? `${path}.${key}` : key;
		if (RAW_KEY_FIELD_PATTERN.test(key)) {
			throw new Error(`Raw private-field key material is forbidden in ${fieldPath}`);
		}
		if (value && typeof value === 'object') {
			assertNoRawKeyMaterial(value, fieldPath);
		}
	}
}

function requireNonEmptyString(value, label) {
	const normalized = String(value || '').trim();
	if (!normalized) throw new Error(`${label} is required`);
	return normalized;
}

function normalizeKdfParams(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('kdfParams must be an object');
	}
	return value;
}

function normalizeWrappedKeyEnvelope(input = {}) {
	assertNoRawKeyMaterial(input);

	const algorithm = requireNonEmptyString(
		input.algorithm || DEFAULT_KEY_ALGORITHM,
		'algorithm',
	);
	const canonicalAlgorithm = KEY_ALGORITHM_ALIASES.get(algorithm) || algorithm;
	if (!SUPPORTED_KEY_ALGORITHMS.has(canonicalAlgorithm)) {
		throw new Error(`Unsupported private-field key algorithm: ${canonicalAlgorithm}`);
	}

	return {
		algorithm: canonicalAlgorithm,
		wrappedKey: requireNonEmptyString(input.wrappedKey, 'wrappedKey'),
		salt: requireNonEmptyString(input.salt, 'salt'),
		iv: requireNonEmptyString(input.iv, 'iv'),
		tag: requireNonEmptyString(input.tag, 'tag'),
		kdfName: requireNonEmptyString(input.kdfName, 'kdfName'),
		kdfParams: normalizeKdfParams(input.kdfParams),
	};
}

function publicKeyMetadata(keyReference) {
	return {
		tenantId: keyReference.tenantId,
		hoaId: keyReference.hoaId || null,
		keyRef: keyReference.keyRef,
		algorithm: keyReference.algorithm,
		wrappedKey: keyReference.wrappedKey,
		salt: keyReference.salt,
		iv: keyReference.iv,
		tag: keyReference.tag,
		kdfName: keyReference.kdfName,
		kdfParams: keyReference.kdfParams,
		version: keyReference.version,
		status: keyReference.status,
		createdAt: keyReference.createdAt,
		rotatedAt: keyReference.rotatedAt || null,
	};
}

function assertAllowedPurpose(purpose) {
	const normalized = requireNonEmptyString(purpose, 'purpose');
	const canonical = PURPOSE_ALIASES.get(normalized) || normalized;
	if (!SUPPORTED_PURPOSES.has(canonical)) {
		throw new Error('Unsupported Zero Trust Level 2 authorization purpose');
	}
	return canonical;
}

function assertCustomerUnlockRole(role) {
	if (PROVIDER_ADMIN_ROLES.has(role)) {
		throw new Error('Provider administrators cannot authorize private-field key references');
	}
	if (!CUSTOMER_UNLOCK_ROLES.has(role)) {
		throw new Error('Tenant or owner role required for private-field authorization');
	}
}

function validateCustomerUnlockPrerequisites({
	role,
	session,
	hasRecentVerification,
	membership,
	trustedDevice,
	requireAdmin = false,
}) {
	assertCustomerUnlockRole(role);
	if (!session?.userId) throw new Error('Authentication required');
	if (!hasRecentVerification) {
		throw new Error('Recent passkey verification required for private-field authorization');
	}
	if (!trustedDevice) throw new Error('Trusted device proof required');
	if (role === 'DOCUMENT_OWNER') return true;
	if (!membership) throw new Error('User is not authorized for this tenant');
	if (requireAdmin && membership.role !== 'ISSUER_ADMIN') {
		throw new Error('HOA administrator role required');
	}
	return true;
}

function verifyUnlockProof({ unlockProof, unlockProofSalt, expectedHash }) {
	const normalizedExpectedHash = String(expectedHash || '');
	if (!normalizedExpectedHash.startsWith('scrypt$')) {
		throw new Error('Unsupported private-field authorization proof hash');
	}
	const proofHash = hashUnlockProof(unlockProof, unlockProofSalt);
	const left = Buffer.from(proofHash);
	const right = Buffer.from(normalizedExpectedHash);
	if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
		throw new Error('Private-field authorization proof rejected');
	}
	return true;
}

function validateUnlockAuthorizationRecord({
	authorization,
	tenantId,
	keyRef,
	userId,
	purpose,
	authorizationToken,
	now = new Date(),
}) {
	if (!authorization) throw new Error('Valid private-field authorization required');

	const normalizedPurpose = assertAllowedPurpose(purpose);
	const expectedHash = hashAuthorizationToken(authorizationToken);
	if (
		authorization.tenantId !== tenantId ||
		authorization.keyRef !== keyRef ||
		authorization.userId !== userId ||
		authorization.purpose !== normalizedPurpose ||
		authorization.authorizationHash !== expectedHash ||
		authorization.status !== 'authorized' ||
		authorization.consumedAt ||
		new Date(authorization.expiresAt) <= now
	) {
		throw new Error('Valid private-field authorization required');
	}

	return true;
}

export {
	CUSTOMER_UNLOCK_ROLES,
	DEFAULT_KEY_ALGORITHM,
	DEFAULT_UNLOCK_TTL_SECONDS,
	PROVIDER_ADMIN_ROLES,
	KEY_ALGORITHM_ALIASES,
	PURPOSE_ALIASES,
	RAW_KEY_FIELD_PATTERN,
	SCRYPT_UNLOCK_PARAMS,
	SUPPORTED_KEY_ALGORITHMS,
	SUPPORTED_PURPOSES,
	assertAllowedPurpose,
	assertCustomerUnlockRole,
	assertNoRawKeyMaterial,
	base64url,
	createKeyRef,
	hashAuthorizationToken,
	hashUnlockProof,
	normalizeWrappedKeyEnvelope,
	publicKeyMetadata,
	requireNonEmptyString,
	validateUnlockAuthorizationRecord,
	validateCustomerUnlockPrerequisites,
	verifyUnlockProof,
};
