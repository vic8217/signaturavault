import crypto from 'crypto';

const ACCOUNT_PRIVATE_FIELD_TENANT_ID = 'signatura_identity';
const ACCOUNT_PRIVATE_FIELD_KEY_REF = 'ztl2_account_private_fields_v1';
const ACCOUNT_PRIVATE_FIELD_RECORD_TYPE = 'user_contact';
const ACCOUNT_PRIVATE_FIELD_ALGORITHM = 'AES-256-GCM';
const ACCOUNT_PRIVATE_FIELD_VERSION = 1;

function requiredEnvSecret(name, fallbackNames = []) {
	for (const key of [name, ...fallbackNames]) {
		const value = process.env[key];
		if (value && value.trim()) return value.trim();
	}
	if (process.env.NODE_ENV === 'production') {
		throw new Error(`${name} is required`);
	}
	return 'development-only-zero-trust-level-2-field-secret-change-me';
}

function deriveAesKey() {
	const secret = requiredEnvSecret('SIGNATURA_FIELD_ENCRYPTION_KEY', [
		'FIELD_ENCRYPTION_KEY',
		'SESSION_SECRET',
	]);
	const decoded = decodeSecret(secret);
	if (decoded.length === 32) return decoded;
	return crypto.createHash('sha256').update(decoded).digest();
}

function decodeSecret(secret) {
	if (/^[a-f0-9]{64}$/i.test(secret)) return Buffer.from(secret, 'hex');
	try {
		const decoded = Buffer.from(secret, 'base64url');
		if (decoded.length >= 32) return decoded;
	} catch {
		// Fall through to utf8 below.
	}
	return Buffer.from(secret, 'utf8');
}

function normalizeEmail(value) {
	return String(value || '').trim().toLowerCase();
}

function normalizeHandphone(value) {
	return String(value || '')
		.trim()
		.replace(/[^\d+]/g, '')
		.replace(/(?!^)\+/g, '');
}

function normalizeFullName(value) {
	return String(value || '').trim().replace(/\s+/g, ' ');
}

function lookupHash(value, label) {
	const pepper = requiredEnvSecret('SIGNATURA_LOOKUP_PEPPER', [
		'PRIVATE_FIELD_LOOKUP_PEPPER',
		'SESSION_SECRET',
	]);
	return crypto.createHmac('sha256', pepper).update(`${label}:${value}`).digest('hex');
}

function accountPrivateFieldAad({ userId, fieldKey }) {
	return [
		'v1',
		ACCOUNT_PRIVATE_FIELD_TENANT_ID,
		ACCOUNT_PRIVATE_FIELD_RECORD_TYPE,
		userId,
		fieldKey,
		ACCOUNT_PRIVATE_FIELD_KEY_REF,
		String(ACCOUNT_PRIVATE_FIELD_VERSION),
	].join(':');
}

function encryptAccountPrivateField({ userId, fieldKey, value }) {
	const aad = accountPrivateFieldAad({ userId, fieldKey });
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', deriveAesKey(), iv);
	cipher.setAAD(Buffer.from(aad, 'utf8'));
	const ciphertext = Buffer.concat([
		cipher.update(String(value), 'utf8'),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();

	return {
		tenantId: ACCOUNT_PRIVATE_FIELD_TENANT_ID,
		ownerUserId: userId,
		recordType: ACCOUNT_PRIVATE_FIELD_RECORD_TYPE,
		recordId: userId,
		fieldKey,
		keyRef: ACCOUNT_PRIVATE_FIELD_KEY_REF,
		algorithm: ACCOUNT_PRIVATE_FIELD_ALGORITHM,
		iv: iv.toString('base64url'),
		tag: tag.toString('base64url'),
		ciphertext: ciphertext.toString('base64url'),
		aad,
		version: ACCOUNT_PRIVATE_FIELD_VERSION,
	};
}

function encryptedAccountContactFields({ userId, fullName, handphone, email }) {
	return [
		encryptAccountPrivateField({ userId, fieldKey: 'full_name', value: fullName }),
		encryptAccountPrivateField({ userId, fieldKey: 'handphone', value: handphone }),
		encryptAccountPrivateField({ userId, fieldKey: 'email', value: email }),
	];
}

async function ensureAccountPrivateFieldKeyReference(tx, userId) {
	await tx.privateFieldKeyReference.upsert({
		where: { keyRef: ACCOUNT_PRIVATE_FIELD_KEY_REF },
		create: {
			tenantId: ACCOUNT_PRIVATE_FIELD_TENANT_ID,
			keyRef: ACCOUNT_PRIVATE_FIELD_KEY_REF,
			algorithm: ACCOUNT_PRIVATE_FIELD_ALGORITHM,
			wrappedKey: 'managed-by-signatura-zero-trust-level-2',
			salt: 'managed',
			iv: 'managed',
			tag: 'managed',
			kdfName: 'managed',
			kdfParams: { type: 'signatura-managed-field-encryption', version: 1 },
			unlockProofSalt: 'managed',
			unlockProofHash: 'managed',
			version: ACCOUNT_PRIVATE_FIELD_VERSION,
			status: 'active',
			createdByUserId: userId,
		},
		update: {},
	});
}

function accountLookupHashes({ email, handphone }) {
	return {
		emailLookupHash: lookupHash(normalizeEmail(email), 'email'),
		mobileLookupHash: lookupHash(normalizeHandphone(handphone), 'handphone'),
	};
}

export {
	ACCOUNT_PRIVATE_FIELD_KEY_REF,
	ACCOUNT_PRIVATE_FIELD_RECORD_TYPE,
	ACCOUNT_PRIVATE_FIELD_TENANT_ID,
	accountLookupHashes,
	encryptedAccountContactFields,
	ensureAccountPrivateFieldKeyReference,
	normalizeEmail,
	normalizeFullName,
	normalizeHandphone,
};
