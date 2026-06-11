'use client';

import { DOCUMENT_REQUEST_RECORD_TYPE } from '@/lib/document-requests/constants';
import { reverifyPasskey } from '@/lib/passkey-client';

const ENCRYPTION_NOT_READY_MESSAGE = 'Secure request encryption is not ready.';

function bytesToBase64url(bytes) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlToBytes(value) {
	const padded = String(value).replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), '='));
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

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

function isDocumentRequestEncryptionReady({ keyRef, hasTrustedDevice = true } = {}) {
	return Boolean(String(keyRef || '').trim() && hasTrustedDevice);
}

async function fetchSubmitWrapSession(issuerId) {
	await reverifyPasskey();

	const response = await fetch(
		`/api/users/issuers/${encodeURIComponent(issuerId)}/document-request-encryption-session`,
		{ method: 'POST' },
	);
	const data = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(data.error || ENCRYPTION_NOT_READY_MESSAGE);
	}
	if (!data.wrapKey || !data.keyRef || !data.tenantId) {
		throw new Error(ENCRYPTION_NOT_READY_MESSAGE);
	}
	return data;
}

async function importWrapKey(wrapKeyBase64url) {
	const keyBytes = base64urlToBytes(wrapKeyBase64url);
	if (keyBytes.length !== 32) {
		throw new Error(ENCRYPTION_NOT_READY_MESSAGE);
	}
	return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
}

async function encryptDocumentRequestField({
	tenantId,
	ownerUserId,
	requestId,
	keyRef,
	fieldKey,
	value,
	wrapKeyBase64url,
}) {
	const aesKey = await importWrapKey(wrapKeyBase64url);
	const version = 1;
	const aad = canonicalPrivateFieldAad({
		tenantId,
		recordType: DOCUMENT_REQUEST_RECORD_TYPE,
		recordId: requestId,
		fieldKey,
		keyRef,
		version,
	});
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) },
		aesKey,
		new TextEncoder().encode(String(value ?? '')),
	);
	const encrypted = new Uint8Array(ciphertext);
	const tagLength = 16;
	const tag = encrypted.slice(encrypted.length - tagLength);
	const payload = encrypted.slice(0, encrypted.length - tagLength);

	return {
		tenantId,
		ownerUserId,
		recordType: DOCUMENT_REQUEST_RECORD_TYPE,
		recordId: requestId,
		fieldKey,
		keyRef,
		algorithm: 'AES-256-GCM',
		iv: bytesToBase64url(iv),
		tag: bytesToBase64url(tag),
		ciphertext: bytesToBase64url(payload),
		aad,
		version,
	};
}

async function encryptDocumentRequestFields({
	issuerId,
	tenantId,
	ownerUserId,
	requestId,
	keyRef,
	fields,
}) {
	const wrapSession = await fetchSubmitWrapSession(issuerId);
	if (wrapSession.tenantId !== tenantId || wrapSession.keyRef !== keyRef) {
		throw new Error(ENCRYPTION_NOT_READY_MESSAGE);
	}

	const encryptedFields = [];
	for (const field of fields) {
		if (!field?.fieldKey) continue;
		if (!field.encrypted) continue;
		encryptedFields.push(
			await encryptDocumentRequestField({
				tenantId,
				ownerUserId,
				requestId,
				keyRef,
				fieldKey: field.fieldKey,
				value: field.value,
				wrapKeyBase64url: wrapSession.wrapKey,
			}),
		);
	}
	return encryptedFields;
}

export {
	ENCRYPTION_NOT_READY_MESSAGE,
	canonicalPrivateFieldAad,
	encryptDocumentRequestField,
	encryptDocumentRequestFields,
	fetchSubmitWrapSession,
	isDocumentRequestEncryptionReady,
};
