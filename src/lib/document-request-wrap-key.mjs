import crypto from 'node:crypto';

import { DOCUMENT_REQUEST_RECORD_TYPE } from './document-requests/constants.js';

const WRAP_KEY_VERSION = 'document_request_wrap_v1';

function requiredWrapMasterSecret() {
	const secret =
		process.env.SIGNATURA_DOCUMENT_REQUEST_WRAP_KEY?.trim() ||
		process.env.SIGNATURA_FIELD_ENCRYPTION_KEY?.trim() ||
		process.env.SESSION_SECRET?.trim() ||
		'';

	if (secret) return secret;
	if (process.env.NODE_ENV === 'production') {
		throw new Error('SIGNATURA_DOCUMENT_REQUEST_WRAP_KEY is required in production');
	}
	return 'development-only-document-request-wrap-secret-change-me';
}

function deriveTenantRequestWrapKey(tenantId, keyRef) {
	const normalizedTenantId = String(tenantId || '').trim();
	const normalizedKeyRef = String(keyRef || '').trim();
	if (!normalizedTenantId || !normalizedKeyRef) {
		throw new Error('tenantId and keyRef are required to derive request wrap key');
	}

	return crypto
		.createHmac('sha256', requiredWrapMasterSecret())
		.update(`${normalizedTenantId}:${normalizedKeyRef}:${WRAP_KEY_VERSION}`)
		.digest();
}

function wrapKeyToBase64url(wrapKey) {
	return Buffer.from(wrapKey).toString('base64url');
}

function wrapKeyFromBase64url(value) {
	const normalized = String(value || '').trim();
	if (!normalized) throw new Error('wrapKey is required');
	const padded = normalized.padEnd(
		normalized.length + ((4 - (normalized.length % 4)) % 4),
		'=',
	);
	const decoded = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
	if (decoded.length !== 32) {
		throw new Error('wrapKey must decode to 32 bytes');
	}
	return decoded;
}

function isDocumentRequestRecordType(recordType) {
	return String(recordType || '').trim() === DOCUMENT_REQUEST_RECORD_TYPE;
}

export {
	WRAP_KEY_VERSION,
	deriveTenantRequestWrapKey,
	isDocumentRequestRecordType,
	wrapKeyFromBase64url,
	wrapKeyToBase64url,
};
