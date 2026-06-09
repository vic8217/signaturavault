import { normalizeWrappedKeyEnvelope } from './privateFieldKeysCore.mjs';

const ENCRYPTED_FIELD_KEYS = new Set([
	'tenantId',
	'hoaId',
	'ownerUserId',
	'recordType',
	'recordId',
	'fieldKey',
	'keyRef',
	'algorithm',
	'iv',
	'tag',
	'ciphertext',
	'aad',
	'version',
]);

const PLAINTEXT_FIELD_KEYS = new Set([
	'value',
	'plain',
	'plaintext',
	'decrypted',
	'recipientName',
	'homeownerName',
	'email',
	'phone',
	'address',
	'metadata',
]);

function assertNoPlaintextPrivateField(input = {}) {
	for (const key of Object.keys(input)) {
		if (PLAINTEXT_FIELD_KEYS.has(key)) {
			throw new Error(`Plaintext private field is forbidden: ${key}`);
		}
	}
}

function decodeBase64Value(value, label) {
	const normalized = String(value || '').trim();
	if (!normalized) throw new Error(`${label} is required`);

	const padded = normalized.padEnd(
		normalized.length + ((4 - (normalized.length % 4)) % 4),
		'=',
	);
	const decoded = Buffer.from(
		padded.replace(/-/g, '+').replace(/_/g, '/'),
		'base64',
	);
	if (decoded.length === 0) throw new Error(`${label} must be base64 encoded`);
	return decoded;
}

function canonicalPrivateFieldAad({
	tenantId,
	recordType,
	recordId,
	fieldKey,
	keyRef,
	version,
}) {
	return [
		'v1',
		tenantId,
		recordType,
		recordId,
		fieldKey,
		keyRef,
		String(version || 1),
	].join(':');
}

function validateAesGcmEnvelope({ iv, tag, ciphertext }) {
	const nonceBytes = decodeBase64Value(iv, 'iv');
	const tagBytes = decodeBase64Value(tag, 'tag');
	decodeBase64Value(ciphertext, 'ciphertext');

	if (nonceBytes.length !== 12) {
		throw new Error('iv must be a 96-bit AES-GCM nonce');
	}
	if (tagBytes.length !== 16) {
		throw new Error('tag must be a 128-bit AES-GCM authentication tag');
	}
}

function normalizeEncryptedPrivateField(input = {}) {
	assertNoPlaintextPrivateField(input);

	for (const key of ['tenantId', 'recordType', 'recordId', 'fieldKey', 'keyRef']) {
		if (!String(input[key] || '').trim()) {
			throw new Error(`${key} is required`);
		}
	}
	const version = Number(input.version || 1);
	const normalizedIdentity = {
		tenantId: String(input.tenantId).trim(),
		recordType: String(input.recordType).trim(),
		recordId: String(input.recordId).trim(),
		fieldKey: String(input.fieldKey).trim(),
		keyRef: String(input.keyRef).trim(),
		version,
	};
	const aad = canonicalPrivateFieldAad(normalizedIdentity);
	if (input.aad && String(input.aad) !== aad) {
		throw new Error('aad does not match encrypted private field identity');
	}

	const cryptoEnvelope = normalizeWrappedKeyEnvelope({
		algorithm: input.algorithm,
		wrappedKey: input.ciphertext,
		salt: 'field-envelope',
		iv: input.iv,
		tag: input.tag,
		kdfName: 'none',
		kdfParams: { type: 'field-ciphertext' },
	});
	validateAesGcmEnvelope({
		iv: cryptoEnvelope.iv,
		tag: cryptoEnvelope.tag,
		ciphertext: cryptoEnvelope.wrappedKey,
	});

	return {
		tenantId: normalizedIdentity.tenantId,
		hoaId: input.hoaId ? String(input.hoaId).trim() : null,
		ownerUserId: input.ownerUserId ? String(input.ownerUserId).trim() : null,
		recordType: normalizedIdentity.recordType,
		recordId: normalizedIdentity.recordId,
		fieldKey: normalizedIdentity.fieldKey,
		keyRef: normalizedIdentity.keyRef,
		algorithm: cryptoEnvelope.algorithm,
		iv: cryptoEnvelope.iv,
		tag: cryptoEnvelope.tag,
		ciphertext: cryptoEnvelope.wrappedKey,
		aad,
		version,
	};
}

function encryptedPrivateFieldToApi(field) {
	return {
		tenantId: field.tenantId,
		hoaId: field.hoaId || null,
		ownerUserId: field.ownerUserId || null,
		recordType: field.recordType,
		recordId: field.recordId,
		fieldKey: field.fieldKey,
		keyRef: field.keyRef,
		algorithm: field.algorithm,
		iv: field.iv,
		tag: field.tag,
		ciphertext: field.ciphertext,
		aad: field.aad || null,
		version: field.version,
	};
}

function validateEncryptedFieldAccess({ role, session, field, membership }) {
	if (['SIGNATURA_ADMIN', 'SIGNATURA_STAFF', 'DEV_ADMIN', 'SUPER_ADMIN'].includes(role)) {
		throw new Error('Provider administrators cannot decrypt private fields');
	}
	if (!session?.userId) throw new Error('Authentication required');
	if (role === 'DOCUMENT_OWNER') {
		if (field.ownerUserId !== session.userId) {
			throw new Error('Homeowner cannot access another owner private field');
		}
		return true;
	}
	if (['ISSUER_ADMIN', 'ISSUER_STAFF'].includes(role)) {
		if (!membership || membership.tenantId !== field.tenantId) {
			throw new Error('Issuer user is not authorized for this tenant');
		}
		return true;
	}
	throw new Error('Customer role required for private field access');
}

function validateEncryptedFieldMutation({ existingField, incomingField, role, session }) {
	if (role === 'DOCUMENT_OWNER' && incomingField.ownerUserId !== session?.userId) {
		throw new Error('Homeowner can write only their own private field');
	}

	if (!existingField) return true;

	if (
		existingField.ownerUserId &&
		incomingField.ownerUserId &&
		existingField.ownerUserId !== incomingField.ownerUserId
	) {
		throw new Error('Private field ownership cannot be reassigned');
	}

	if (
		existingField.ownerUserId &&
		role === 'DOCUMENT_OWNER' &&
		existingField.ownerUserId !== session?.userId
	) {
		throw new Error('Homeowner cannot overwrite another owner private field');
	}

	return true;
}

export {
	ENCRYPTED_FIELD_KEYS,
	PLAINTEXT_FIELD_KEYS,
	assertNoPlaintextPrivateField,
	canonicalPrivateFieldAad,
	encryptedPrivateFieldToApi,
	normalizeEncryptedPrivateField,
	validateAesGcmEnvelope,
	validateEncryptedFieldAccess,
	validateEncryptedFieldMutation,
};
