import crypto from 'node:crypto';

import { canonicalPrivateFieldAad } from './security/encryptedFieldsCore.mjs';
import { deriveTenantRequestWrapKey } from './document-request-wrap-key.mjs';

function encryptDocumentRequestField({
	tenantId,
	recordType,
	recordId,
	fieldKey,
	keyRef,
	plaintext,
	version = 1,
}) {
	const normalizedPlaintext = String(plaintext ?? '');
	const wrapKey = deriveTenantRequestWrapKey(tenantId, keyRef);
	const aad = canonicalPrivateFieldAad({
		tenantId,
		recordType,
		recordId,
		fieldKey,
		keyRef,
		version,
	});
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', wrapKey, iv);
	cipher.setAAD(Buffer.from(aad, 'utf8'));
	const ciphertext = Buffer.concat([
		cipher.update(normalizedPlaintext, 'utf8'),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();

	return {
		tenantId,
		recordType,
		recordId,
		fieldKey,
		keyRef,
		version,
		algorithm: 'AES-256-GCM',
		aad,
		iv: iv.toString('base64url'),
		tag: tag.toString('base64url'),
		ciphertext: ciphertext.toString('base64url'),
	};
}

export { encryptDocumentRequestField };
