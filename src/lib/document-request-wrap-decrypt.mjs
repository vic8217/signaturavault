import crypto from 'node:crypto';

import { deriveTenantRequestWrapKey } from './document-request-wrap-key.mjs';

function decodeBase64url(value, label) {
	const normalized = String(value || '').trim();
	if (!normalized) throw new Error(`${label} is required`);
	const padded = normalized.padEnd(
		normalized.length + ((4 - (normalized.length % 4)) % 4),
		'=',
	);
	return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function decryptDocumentRequestField(field) {
	if (!field?.aad) {
		throw new Error('Encrypted document request field is missing aad');
	}

	const wrapKey = deriveTenantRequestWrapKey(field.tenantId, field.keyRef);
	const iv = decodeBase64url(field.iv, 'iv');
	const tag = decodeBase64url(field.tag, 'tag');
	const ciphertext = decodeBase64url(field.ciphertext, 'ciphertext');
	const decipher = crypto.createDecipheriv('aes-256-gcm', wrapKey, iv);
	decipher.setAAD(Buffer.from(String(field.aad), 'utf8'));
	decipher.setAuthTag(tag);
	const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

	return plaintext.toString('utf8');
}

export { decryptDocumentRequestField };
