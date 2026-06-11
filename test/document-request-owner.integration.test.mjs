import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { prisma, resetHarness } from './harness/state.mjs';
import { DOCUMENT_REQUEST_AUDIT_ACTIONS, DOCUMENT_REQUEST_STATUS } from '../src/lib/document-requests/constants.js';
import { assertEncryptedSubmitPayload } from '../src/lib/document-requestsCore.mjs';
import {
	cancelOwnerDocumentRequest,
	listOwnerDocumentRequests,
	submitOwnerDocumentRequest,
} from '../src/lib/document-request-owner.js';

const VALID_IV = Buffer.alloc(12, 1).toString('base64url');
const VALID_TAG = Buffer.alloc(16, 2).toString('base64url');
const VALID_CIPHERTEXT = Buffer.from('ciphertext').toString('base64url');
const TENANT_ID = 'tenant_request_1';
const ISSUER_ID = 'issuer_request_1';
const TYPE_ID = 'type_transcript';
const OWNER_A = 'owner_a';
const OWNER_B = 'owner_b';

function sampleEncryptedField(fieldKey, overrides = {}) {
	return {
		fieldKey,
		keyRef: 'ztpf_tenant_request_1_testkeyref',
		algorithm: 'AES-256-GCM',
		iv: VALID_IV,
		tag: VALID_TAG,
		ciphertext: VALID_CIPHERTEXT,
		...overrides,
	};
}

function buildSubmitBody(overrides = {}) {
	const requestId = overrides.requestId || crypto.randomUUID();
	return {
		requestId,
		issuerId: ISSUER_ID,
		documentTypeId: TYPE_ID,
		encryptedFields: [
			sampleEncryptedField('purpose'),
			sampleEncryptedField('privateReference'),
			sampleEncryptedField('notes'),
		],
		...overrides,
	};
}

function seedRequestFixtures() {
	resetHarness({
		issuer: [
			{
				id: ISSUER_ID,
				tenantId: TENANT_ID,
				name: 'Example University',
				status: 'active',
				acceptsRequests: true,
			},
		],
		documentType: [
			{
				id: TYPE_ID,
				tenantId: TENANT_ID,
				name: 'Official Transcript',
				description: 'Transcript request',
			},
		],
		privateFieldKeyReference: [
			{
				id: 'key_ref_1',
				tenantId: TENANT_ID,
				keyRef: 'ztpf_tenant_request_1_testkeyref',
				status: 'active',
				algorithm: 'AES-256-GCM',
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
			},
		],
	});
}

test('plaintext privateReference in submit payload is rejected', () => {
	assert.throws(
		() =>
			assertEncryptedSubmitPayload({
				issuerId: ISSUER_ID,
				documentTypeId: TYPE_ID,
				privateReference: 'STU-12345',
				encryptedFields: [sampleEncryptedField('purpose')],
			}),
		/privateReference/,
	);
});

test('owner can submit valid encrypted request', async () => {
	seedRequestFixtures();

	const body = buildSubmitBody();
	const result = await submitOwnerDocumentRequest(body, { ownerUserId: OWNER_A });

	assert.equal(result.request.status, DOCUMENT_REQUEST_STATUS.PENDING);
	assert.match(result.request.referenceCode, /^REQ-/);
	assert.equal(result.request.issuerDisplayName, 'Example University');
	assert.equal(result.request.documentTypeLabel, 'Official Transcript');

	const storedFields = prisma.encryptedPrivateField.__rows;
	assert.equal(storedFields.length, 3);
	assert.equal(
		storedFields.some((field) => field.fieldKey === 'privateReference'),
		true,
	);
	assert.equal(
		storedFields.every((field) => field.recordType === 'document_request'),
		true,
	);

	const audit = prisma.auditLog.__rows.find(
		(entry) => entry.action === DOCUMENT_REQUEST_AUDIT_ACTIONS.SUBMITTED,
	);
	assert.ok(audit);
	assert.equal(audit.details.requestId, result.request.requestId);
	assert.equal(Object.hasOwn(audit.details, 'privateReference'), false);
	assert.equal(Object.hasOwn(audit.details, 'ciphertext'), false);
});

test('duplicate active request is rejected', async () => {
	seedRequestFixtures();
	const first = buildSubmitBody();
	await submitOwnerDocumentRequest(first, { ownerUserId: OWNER_A });

	await assert.rejects(
		() =>
			submitOwnerDocumentRequest(buildSubmitBody(), {
				ownerUserId: OWNER_A,
			}),
		/active document request already exists/i,
	);
});

test('owner can list only own requests', async () => {
	seedRequestFixtures();
	const ownerARequest = await submitOwnerDocumentRequest(buildSubmitBody(), {
		ownerUserId: OWNER_A,
	});
	await submitOwnerDocumentRequest(buildSubmitBody(), { ownerUserId: OWNER_B });

	const ownerAList = await listOwnerDocumentRequests(OWNER_A);
	assert.equal(ownerAList.length, 1);
	assert.equal(ownerAList[0].requestId, ownerARequest.request.requestId);
	assert.equal(ownerAList[0].issuerDisplayName, 'Example University');
	assert.equal(Object.hasOwn(ownerAList[0], 'ciphertext'), false);
});

test('owner can cancel pending request', async () => {
	seedRequestFixtures();
	const created = await submitOwnerDocumentRequest(buildSubmitBody(), {
		ownerUserId: OWNER_A,
	});

	const cancelled = await cancelOwnerDocumentRequest({
		requestId: created.request.requestId,
		ownerUserId: OWNER_A,
		auditContext: { actorUserId: OWNER_A },
	});

	assert.equal(cancelled.request.status, DOCUMENT_REQUEST_STATUS.CANCELLED);
	const audit = prisma.auditLog.__rows.find(
		(entry) => entry.action === DOCUMENT_REQUEST_AUDIT_ACTIONS.CANCELLED,
	);
	assert.ok(audit);
	assert.equal(Object.hasOwn(audit.details, 'privateReference'), false);
});

test('owner cannot cancel non-pending request', async () => {
	seedRequestFixtures();
	const created = await submitOwnerDocumentRequest(buildSubmitBody(), {
		ownerUserId: OWNER_A,
	});
	const row = prisma.documentRequest.__rows.find(
		(entry) => entry.id === created.request.requestId,
	);
	row.status = DOCUMENT_REQUEST_STATUS.APPROVED;

	await assert.rejects(
		() =>
			cancelOwnerDocumentRequest({
				requestId: created.request.requestId,
				ownerUserId: OWNER_A,
			}),
		/Only pending document requests can be cancelled/,
	);
});

test('owner cannot access another owner request for cancel', async () => {
	seedRequestFixtures();
	const created = await submitOwnerDocumentRequest(buildSubmitBody(), {
		ownerUserId: OWNER_A,
	});

	await assert.rejects(
		() =>
			cancelOwnerDocumentRequest({
				requestId: created.request.requestId,
				ownerUserId: OWNER_B,
			}),
		/not found/i,
	);
});
