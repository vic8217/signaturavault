import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { DOCUMENT_REQUEST_RECORD_TYPE } from '../src/lib/document-requests/constants.js';
import {
	deriveTenantRequestWrapKey,
	wrapKeyToBase64url,
} from '../src/lib/document-request-wrap-key.mjs';
import { decryptDocumentRequestField } from '../src/lib/document-request-wrap-decrypt.mjs';

function canonicalPrivateFieldAad({
	tenantId,
	recordType,
	recordId,
	fieldKey,
	keyRef,
	version = 1,
}) {
	return ['v1', tenantId, recordType, recordId, fieldKey, keyRef, String(version)].join(
		':',
	);
}

test('tenant request wrap key is deterministic per tenant and keyRef', () => {
	const first = deriveTenantRequestWrapKey('tenant_a', 'ztpf_tenant_a_1_abc');
	const second = deriveTenantRequestWrapKey('tenant_a', 'ztpf_tenant_a_1_abc');
	const other = deriveTenantRequestWrapKey('tenant_b', 'ztpf_tenant_a_1_abc');

	assert.equal(first.length, 32);
	assert.deepEqual(first, second);
	assert.notDeepEqual(first, other);
});

test('document request wrap encrypt/decrypt round-trip preserves plaintext', () => {
	const tenantId = 'tenant_wrap_test';
	const keyRef = 'ztpf_tenant_wrap_test_1_demo';
	const requestId = 'req_wrap_test';
	const fieldKey = 'privateReference';
	const value = 'STU-2026-001234';
	const wrapKey = deriveTenantRequestWrapKey(tenantId, keyRef);
	const aad = canonicalPrivateFieldAad({
		tenantId,
		recordType: DOCUMENT_REQUEST_RECORD_TYPE,
		recordId: requestId,
		fieldKey,
		keyRef,
	});
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', wrapKey, iv);
	cipher.setAAD(Buffer.from(aad, 'utf8'));
	const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();

	const decrypted = decryptDocumentRequestField({
		tenantId,
		keyRef,
		aad,
		iv: iv.toString('base64url'),
		tag: tag.toString('base64url'),
		ciphertext: ciphertext.toString('base64url'),
	});

	assert.equal(decrypted, value);
	assert.equal(wrapKeyToBase64url(wrapKey).length > 0, true);
});
