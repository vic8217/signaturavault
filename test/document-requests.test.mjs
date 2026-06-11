import test from 'node:test';
import assert from 'node:assert/strict';

import {
	DOCUMENT_REQUEST_STATUS,
	FALLBACK_REQUEST_FIELD_KEYS,
} from '../src/lib/document-requests/constants.js';
import {
	assertEncryptedSubmitPayload,
	assertNoActiveDocumentRequest,
	assertOwnerCanCancelRequest,
	assertPlatformAdminCannotDecrypt,
	assertPlatformAdminSummaryOnly,
	buildWorkflowReferenceCode,
	canTransitionDocumentRequestStatus,
	documentRequestToAdminSummary,
	documentRequestToOwnerListItem,
	isActiveDocumentRequestStatus,
	isWorkflowReferenceCode,
	validateCreateDocumentRequestInput,
	validateFallbackEncryptedFieldKeys,
} from '../src/lib/document-requestsCore.mjs';

const VALID_IV = Buffer.alloc(12, 1).toString('base64url');
const VALID_TAG = Buffer.alloc(16, 2).toString('base64url');
const VALID_CIPHERTEXT = Buffer.from('ciphertext').toString('base64url');

function sampleEncryptedField(fieldKey, overrides = {}) {
	return {
		fieldKey,
		keyRef: 'ztpf_tenant_1_1_testkeyref',
		algorithm: 'AES-256-GCM',
		iv: VALID_IV,
		tag: VALID_TAG,
		ciphertext: VALID_CIPHERTEXT,
		...overrides,
	};
}

test('workflow reference codes are distinct from private reference numbers', () => {
	const code = buildWorkflowReferenceCode(new Date('2026-06-11T00:00:00.000Z'));

	assert.match(code, /^REQ-2026-[A-Z0-9]{8}$/);
	assert.equal(isWorkflowReferenceCode(code), true);
	assert.equal(isWorkflowReferenceCode('STU-2024-001234'), false);
	assert.equal(isWorkflowReferenceCode('1234567890'), false);
});

test('active request uniqueness blocks pending and approved duplicates', () => {
	assert.equal(isActiveDocumentRequestStatus(DOCUMENT_REQUEST_STATUS.PENDING), true);
	assert.equal(isActiveDocumentRequestStatus(DOCUMENT_REQUEST_STATUS.APPROVED), true);
	assert.equal(isActiveDocumentRequestStatus(DOCUMENT_REQUEST_STATUS.DENIED), false);

	assert.throws(
		() =>
			assertNoActiveDocumentRequest({
				id: 'req_1',
				status: DOCUMENT_REQUEST_STATUS.PENDING,
			}),
		/active document request already exists/i,
	);

	assert.doesNotThrow(() =>
		assertNoActiveDocumentRequest({
			id: 'req_2',
			status: DOCUMENT_REQUEST_STATUS.DENIED,
		}),
	);
});

test('status transitions follow the v1 workflow', () => {
	assert.equal(
		canTransitionDocumentRequestStatus(
			DOCUMENT_REQUEST_STATUS.PENDING,
			DOCUMENT_REQUEST_STATUS.APPROVED,
		),
		true,
	);
	assert.equal(
		canTransitionDocumentRequestStatus(
			DOCUMENT_REQUEST_STATUS.PENDING,
			DOCUMENT_REQUEST_STATUS.CANCELLED,
		),
		true,
	);
	assert.equal(
		canTransitionDocumentRequestStatus(
			DOCUMENT_REQUEST_STATUS.APPROVED,
			DOCUMENT_REQUEST_STATUS.ISSUED,
		),
		true,
	);
	assert.equal(
		canTransitionDocumentRequestStatus(
			DOCUMENT_REQUEST_STATUS.DENIED,
			DOCUMENT_REQUEST_STATUS.PENDING,
		),
		false,
	);
});

test('only pending requests can be cancelled by owner', () => {
	assert.doesNotThrow(() =>
		assertOwnerCanCancelRequest(DOCUMENT_REQUEST_STATUS.PENDING),
	);
	assert.throws(
		() => assertOwnerCanCancelRequest(DOCUMENT_REQUEST_STATUS.APPROVED),
		/Only pending document requests can be cancelled/,
	);
});

test('platform administrators cannot decrypt request private fields', () => {
	assert.throws(
		() => assertPlatformAdminCannotDecrypt('SIGNATURA_ADMIN'),
		/Provider administrators cannot decrypt document request private fields/,
	);
	assert.doesNotThrow(() => assertPlatformAdminCannotDecrypt('ISSUER_STAFF'));
	assert.doesNotThrow(() => assertPlatformAdminCannotDecrypt('DOCUMENT_OWNER'));
});

test('admin summary DTO exposes only whitelisted metadata', () => {
	const summary = documentRequestToAdminSummary(
		{
			id: 'req_1',
			referenceCode: 'REQ-2026-AB12CD34',
			status: DOCUMENT_REQUEST_STATUS.PENDING,
			documentTypeLabel: 'Transcript',
			submittedAt: new Date('2026-06-11T00:00:00.000Z'),
			reviewedAt: null,
			issuedAt: null,
			cancelledAt: null,
		},
		'Example University',
	);

	assert.deepEqual(Object.keys(summary).sort(), [
		'cancelledAt',
		'documentTypeLabel',
		'id',
		'issuedAt',
		'issuerName',
		'referenceCode',
		'reviewedAt',
		'status',
		'submittedAt',
	]);
	assert.equal(summary.issuerName, 'Example University');
	assert.equal(summary.referenceCode, 'REQ-2026-AB12CD34');
});

test('admin summary access is limited to platform administrator roles', () => {
	assert.doesNotThrow(() => assertPlatformAdminSummaryOnly('SIGNATURA_ADMIN'));
	assert.throws(
		() => assertPlatformAdminSummaryOnly('ISSUER_ADMIN'),
		/Admin summary access requires a platform administrator role/,
	);
});

test('create validation requires encrypted private fields and routing metadata', () => {
	assert.throws(
		() => validateCreateDocumentRequestInput({ ownerUserId: 'user_1' }),
		/issuerId is required/,
	);

	assert.throws(
		() =>
			validateCreateDocumentRequestInput({
				ownerUserId: 'user_1',
				issuerId: 'issuer_1',
				tenantId: 'tenant_1',
				documentTypeId: 'type_1',
				encryptedFields: [],
			}),
		/encryptedFields must include at least one encrypted private field/,
	);

	assert.doesNotThrow(() =>
		validateCreateDocumentRequestInput({
			ownerUserId: 'user_1',
			issuerId: 'issuer_1',
			tenantId: 'tenant_1',
			documentTypeId: 'type_1',
			encryptedFields: [
				sampleEncryptedField('purpose'),
				sampleEncryptedField('privateReference'),
				sampleEncryptedField('notes'),
			],
		}),
	);
});

test('owner list DTO excludes encrypted private field contents', () => {
	const item = documentRequestToOwnerListItem(
		{
			id: 'req_1',
			referenceCode: 'REQ-2026-AB12CD34',
			documentTypeLabel: 'Transcript',
			status: DOCUMENT_REQUEST_STATUS.PENDING,
			submittedAt: new Date('2026-06-11T00:00:00.000Z'),
			updatedAt: new Date('2026-06-11T01:00:00.000Z'),
			issuedDocumentRecordId: null,
			walletDelivered: false,
		},
		'Example University',
	);

	assert.equal(item.requestId, 'req_1');
	assert.equal(item.issuerDisplayName, 'Example University');
	assert.equal(item.statusMessage, 'Your request is waiting for issuer review.');
	assert.equal(Object.hasOwn(item, 'ciphertext'), false);
	assert.equal(Object.hasOwn(item, 'privateReference'), false);
});

test('fallback form requires encrypted purpose, privateReference, and notes', () => {
	assert.deepEqual(FALLBACK_REQUEST_FIELD_KEYS, [
		'purpose',
		'privateReference',
		'notes',
	]);

	assert.throws(
		() => validateFallbackEncryptedFieldKeys(['purpose', 'notes']),
		/privateReference/,
	);

	assert.doesNotThrow(() =>
		validateFallbackEncryptedFieldKeys([
			'purpose',
			'privateReference',
			'notes',
		]),
	);
});
