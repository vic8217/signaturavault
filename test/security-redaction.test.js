import test from 'node:test';
import assert from 'node:assert/strict';

import {
	assertNotProviderAdminForPrivateData,
	redactForLog,
	redactIssuerForProvider,
	safeApiLogEntry,
} from '../src/lib/security/core.mjs';
import {
	assertAllowedPurpose,
	hashUnlockProof,
	hashAuthorizationToken,
	normalizeWrappedKeyEnvelope,
	validateUnlockAuthorizationRecord,
	validateCustomerUnlockPrerequisites,
	verifyUnlockProof,
} from '../src/lib/security/privateFieldKeysCore.mjs';
import {
	normalizeEncryptedPrivateField,
	validateEncryptedFieldAccess,
	validateEncryptedFieldMutation,
} from '../src/lib/security/encryptedFieldsCore.mjs';
import {
	accountLookupHashes,
	encryptedAccountContactFields,
} from '../src/lib/account-private-fields.js';
import { userPublicIdentity } from '../src/lib/identity.js';

const VALID_IV = Buffer.alloc(12, 1).toString('base64url');
const VALID_TAG = Buffer.alloc(16, 2).toString('base64url');
const VALID_CIPHERTEXT = Buffer.from('ciphertext').toString('base64url');

test('redactForLog removes private values and key material', () => {
	const redacted = redactForLog({
		recipientName: 'Ada Homeowner',
		metadata: { unit: '12A', publicStatus: 'valid' },
		nested: { apiKey: 'key_123', count: 1 },
	});

	assert.equal(redacted.recipientName, '[redacted]');
	assert.equal(redacted.metadata, '[redacted]');
	assert.equal(redacted.nested.apiKey, '[redacted]');
	assert.equal(redacted.nested.count, 1);
});

test('safeApiLogEntry removes query tokens and redacts private bodies', () => {
	const log = safeApiLogEntry({
		id: 'log_1',
		tenantId: 'tenant_1',
		req: {
			url: 'https://example.test/api/issuers/tenant_1/verify?token=verify_secret',
			method: 'GET',
		},
		status: 200,
		requestBody: { token: 'verify_secret' },
		responseBody: { recipientName: 'Ada Homeowner', documentStatus: 'valid' },
		createdAt: '2026-06-03T00:00:00.000Z',
	});

	assert.equal(log.path, '/api/issuers/tenant_1/verify');
	assert.equal(log.request_body.token, '[redacted]');
	assert.equal(log.response_body.recipientName, '[redacted]');
	assert.equal(log.response_body.documentStatus, 'valid');
});

test('provider admins are denied private-data access', () => {
	assert.throws(
		() => assertNotProviderAdminForPrivateData('SIGNATURA_ADMIN'),
		/Provider administrators cannot access private data/,
	);
	assert.doesNotThrow(() => assertNotProviderAdminForPrivateData('ISSUER_ADMIN'));
});

test('provider issuer DTOs are redacted', () => {
	const dto = redactIssuerForProvider(
		{
			id: 'issuer_1',
			tenant_id: 'tenant_1',
			name: 'HOA Inc',
			address: '123 Private Road',
			registration_number: 'REG-123',
			contact_email: 'admin@example.test',
			status: 'active',
		},
		{ name: 'HOA Tenant' },
	);

	assert.equal(dto.address, '[redacted]');
	assert.equal(dto.registrationNumber, '[redacted]');
	assert.equal(dto.contactEmail, '[redacted]');
	assert.equal(dto.privateDataRedacted, true);
});

test('public user identity excludes legacy contact fields', () => {
	const dto = userPublicIdentity({
		id: 'user_internal_uuid',
		signaturaId: 'SIG-8FD2A91C',
		email: 'owner@example.test',
		name: 'Ada Homeowner',
		accountStatus: 'active',
		trustLevel: 2,
	});

	assert.deepEqual(dto, {
		id: 'user_internal_uuid',
		signaturaId: 'SIG-8FD2A91C',
		accountStatus: 'active',
		trustLevel: 2,
	});
	assert.equal(Object.hasOwn(dto, 'email'), false);
	assert.equal(Object.hasOwn(dto, 'name'), false);
});

test('account contact fields are encrypted before storage', () => {
	const fields = encryptedAccountContactFields({
		userId: 'user_1',
		fullName: 'Ada Homeowner',
		handphone: '+639170000000',
		email: 'ada@example.test',
	});
	const serialized = JSON.stringify(fields);

	assert.equal(fields.length, 3);
	assert.equal(serialized.includes('Ada Homeowner'), false);
	assert.equal(serialized.includes('+639170000000'), false);
	assert.equal(serialized.includes('ada@example.test'), false);
	assert.deepEqual(
		fields.map((field) => field.fieldKey).sort(),
		['email', 'full_name', 'handphone'],
	);
	for (const field of fields) {
		assert.equal(field.recordType, 'user_contact');
		assert.equal(field.ownerUserId, 'user_1');
		assert.equal(field.algorithm, 'AES-256-GCM');
		assert.ok(field.ciphertext);
		assert.ok(field.iv);
		assert.ok(field.tag);
	}
});

test('account lookup hashes are normalized and do not reveal contact values', () => {
	const first = accountLookupHashes({
		email: 'Ada@Example.Test ',
		handphone: '+63 917 000 0000',
	});
	const second = accountLookupHashes({
		email: 'ada@example.test',
		handphone: '+639170000000',
	});

	assert.deepEqual(first, second);
	assert.notEqual(first.emailLookupHash, 'ada@example.test');
	assert.notEqual(first.mobileLookupHash, '+639170000000');
});

test('private-field key envelopes reject raw key material', () => {
	assert.throws(
		() =>
			normalizeWrappedKeyEnvelope({
				rawTenantKey: 'known-secret-key',
				wrappedKey: 'ciphertext',
				salt: 'salt',
				iv: 'iv',
				tag: 'tag',
				kdfName: 'PBKDF2',
				kdfParams: { iterations: 210000 },
			}),
		/Raw private-field key material is forbidden/,
	);
});

test('private-field key metadata stores no known plaintext key', () => {
	const envelope = normalizeWrappedKeyEnvelope({
		wrappedKey: 'ciphertext-not-the-key',
		salt: 'salt',
		iv: 'iv',
		tag: 'tag',
		kdfName: 'PBKDF2',
		kdfParams: { iterations: 210000 },
	});

	assert.notEqual(envelope.wrappedKey, 'known-secret-key');
	assert.equal(envelope.algorithm, 'AES-256-GCM');
});

test('Level 2 Zero Trust purpose names map to authorization records', () => {
	assert.equal(assertAllowedPurpose('read_encrypted_payload'), 'decrypt_private_record');
	assert.equal(assertAllowedPurpose('encrypt_payload'), 'encrypt_private_record');
	assert.equal(assertAllowedPurpose('export_payload'), 'export_private_data');
	assert.throws(
		() => assertAllowedPurpose('provider_decrypt'),
		/Unsupported Zero Trust Level 2 authorization purpose/,
	);
});

test('provider and Signatura admins cannot authorize private-field key references', () => {
	for (const role of ['SIGNATURA_ADMIN', 'SIGNATURA_STAFF', 'DEV_ADMIN']) {
		assert.throws(
			() =>
				validateCustomerUnlockPrerequisites({
					role,
					session: { userId: 'provider' },
					hasRecentVerification: true,
					trustedDevice: { id: 'device' },
					membership: { role },
				}),
			/Provider administrators cannot authorize private-field key references/,
		);
	}
});

test('forged session cookie alone cannot unlock', () => {
	assert.throws(
		() =>
			validateCustomerUnlockPrerequisites({
				role: 'ISSUER_ADMIN',
				session: { userId: 'admin' },
				hasRecentVerification: false,
				trustedDevice: { id: 'device' },
				membership: { role: 'ISSUER_ADMIN' },
			}),
		/Recent passkey verification required/,
	);
});

test('database membership mutation alone cannot unlock without device proof', () => {
	assert.throws(
		() =>
			validateCustomerUnlockPrerequisites({
				role: 'ISSUER_ADMIN',
				session: { userId: 'admin' },
				hasRecentVerification: true,
				trustedDevice: null,
				membership: { role: 'ISSUER_ADMIN' },
			}),
		/Trusted device proof required/,
	);
});

test('HOA admin can authorize only with tenant membership and valid proof', () => {
	validateCustomerUnlockPrerequisites({
		role: 'ISSUER_ADMIN',
		session: { userId: 'admin' },
		hasRecentVerification: true,
		trustedDevice: { id: 'device' },
		membership: { role: 'ISSUER_ADMIN' },
		requireAdmin: true,
	});

	const salt = 'proof-salt';
	const proof = 'customer-unlock-proof-not-wrapping-key';
	const expectedHash = hashUnlockProof(proof, salt);
	assert.match(expectedHash, /^scrypt\$/);
	assert.equal(
		verifyUnlockProof({ unlockProof: proof, unlockProofSalt: salt, expectedHash }),
		true,
	);
	assert.throws(
		() =>
			verifyUnlockProof({
				unlockProof: 'wrong-proof',
				unlockProofSalt: salt,
				expectedHash,
			}),
		/Private-field authorization proof rejected/,
	);
	assert.throws(
		() =>
			verifyUnlockProof({
				unlockProof: proof,
				unlockProofSalt: salt,
				expectedHash: 'legacy-sha256-hash',
			}),
		/Unsupported private-field authorization proof hash/,
	);
});

test('encrypted private fields reject known plaintext', () => {
	assert.throws(
		() =>
			normalizeEncryptedPrivateField({
				tenantId: 'tenant_1',
				recordType: 'homeowner',
				recordId: 'homeowner_1',
				fieldKey: 'name',
				keyRef: 'ck_tenant_1',
				algorithm: 'AES-GCM-256',
				iv: VALID_IV,
				tag: VALID_TAG,
				ciphertext: VALID_CIPHERTEXT,
				plaintext: 'Ada Homeowner',
			}),
		/Plaintext private field is forbidden/,
	);

	const field = normalizeEncryptedPrivateField({
		tenantId: 'tenant_1',
		recordType: 'homeowner',
		recordId: 'homeowner_1',
		fieldKey: 'name',
		keyRef: 'ck_tenant_1',
		algorithm: 'AES-GCM-256',
		iv: VALID_IV,
		tag: VALID_TAG,
		ciphertext: VALID_CIPHERTEXT,
	});
	assert.notEqual(field.ciphertext, 'Ada Homeowner');
	assert.equal(
		field.aad,
		'v1:tenant_1:homeowner:homeowner_1:name:ck_tenant_1:1',
	);
	assert.throws(
		() =>
			normalizeEncryptedPrivateField({
				tenantId: 'tenant_1',
				recordType: 'homeowner',
				recordId: 'homeowner_1',
				fieldKey: 'name',
				keyRef: 'ck_tenant_1',
				algorithm: 'AES-GCM-256',
				iv: Buffer.alloc(8, 1).toString('base64url'),
				tag: VALID_TAG,
				ciphertext: VALID_CIPHERTEXT,
			}),
		/iv must be a 96-bit AES-GCM nonce/,
	);
	assert.throws(
		() =>
			normalizeEncryptedPrivateField({
				tenantId: 'tenant_1',
				recordType: 'homeowner',
				recordId: 'homeowner_1',
				fieldKey: 'name',
				keyRef: 'ck_tenant_1',
				algorithm: 'AES-GCM-256',
				iv: VALID_IV,
				tag: VALID_TAG,
				ciphertext: VALID_CIPHERTEXT,
				aad: 'wrong-aad',
			}),
		/aad does not match encrypted private field identity/,
	);
});

test('homeowners can access only their own encrypted private fields', () => {
	const field = normalizeEncryptedPrivateField({
		tenantId: 'tenant_1',
		ownerUserId: 'homeowner_1',
		recordType: 'homeowner',
		recordId: 'homeowner_1',
		fieldKey: 'phone',
		keyRef: 'ck_tenant_1',
		algorithm: 'AES-GCM-256',
		iv: VALID_IV,
		tag: VALID_TAG,
		ciphertext: VALID_CIPHERTEXT,
	});

	assert.equal(
		validateEncryptedFieldAccess({
			role: 'DOCUMENT_OWNER',
			session: { userId: 'homeowner_1' },
			field,
		}),
		true,
	);
	assert.throws(
		() =>
			validateEncryptedFieldAccess({
				role: 'DOCUMENT_OWNER',
				session: { userId: 'homeowner_2' },
				field,
			}),
		/Homeowner cannot access another owner private field/,
	);
	assert.throws(
		() =>
			validateEncryptedFieldAccess({
				role: 'SIGNATURA_ADMIN',
				session: { userId: 'provider' },
				field,
			}),
		/Provider administrators cannot decrypt private fields/,
	);
});

test('encrypted private field ownership cannot be reassigned on upsert', () => {
	const existingField = normalizeEncryptedPrivateField({
		tenantId: 'tenant_1',
		ownerUserId: 'homeowner_1',
		recordType: 'homeowner',
		recordId: 'homeowner_1',
		fieldKey: 'phone',
		keyRef: 'ck_tenant_1',
		algorithm: 'AES-GCM-256',
		iv: VALID_IV,
		tag: VALID_TAG,
		ciphertext: VALID_CIPHERTEXT,
	});
	const incomingField = {
		...existingField,
		ownerUserId: 'homeowner_2',
		ciphertext: 'new-ciphertext',
	};

	assert.throws(
		() =>
			validateEncryptedFieldMutation({
				existingField,
				incomingField,
				role: 'ISSUER_ADMIN',
				session: { userId: 'admin' },
			}),
		/Private field ownership cannot be reassigned/,
	);
	assert.throws(
		() =>
			validateEncryptedFieldMutation({
				existingField,
				incomingField: existingField,
				role: 'DOCUMENT_OWNER',
				session: { userId: 'homeowner_2' },
			}),
		/Homeowner can write only their own private field/,
	);
});

test('private-field authorization records are scoped and one-time usable', () => {
	const authorizationToken = 'ckauth_test_token';
	const authorization = {
		tenantId: 'tenant_1',
		keyRef: 'ck_tenant_1',
		userId: 'user_1',
		purpose: 'decrypt_private_record',
		authorizationHash: hashAuthorizationToken(authorizationToken),
		status: 'authorized',
		consumedAt: null,
		expiresAt: new Date('2030-01-01T00:00:00.000Z'),
	};

	assert.equal(
		validateUnlockAuthorizationRecord({
			authorization,
			tenantId: 'tenant_1',
			keyRef: 'ck_tenant_1',
			userId: 'user_1',
			purpose: 'read_encrypted_payload',
			authorizationToken,
			now: new Date('2029-01-01T00:00:00.000Z'),
		}),
		true,
	);
	assert.throws(
		() =>
			validateUnlockAuthorizationRecord({
				authorization,
				tenantId: 'tenant_2',
				keyRef: 'ck_tenant_1',
				userId: 'user_1',
				purpose: 'read_encrypted_payload',
				authorizationToken,
				now: new Date('2029-01-01T00:00:00.000Z'),
			}),
		/Valid private-field authorization required/,
	);
	assert.throws(
		() =>
			validateUnlockAuthorizationRecord({
				authorization: { ...authorization, consumedAt: new Date() },
				tenantId: 'tenant_1',
				keyRef: 'ck_tenant_1',
				userId: 'user_1',
				purpose: 'read_encrypted_payload',
				authorizationToken,
				now: new Date('2029-01-01T00:00:00.000Z'),
			}),
		/Valid private-field authorization required/,
	);
});
