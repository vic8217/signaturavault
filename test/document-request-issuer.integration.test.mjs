import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { prisma, resetHarness } from './harness/state.mjs';
import { DOCUMENT_REQUEST_AUDIT_ACTIONS, DOCUMENT_REQUEST_RECORD_TYPE, DOCUMENT_REQUEST_STATUS } from '../src/lib/document-requests/constants.js';
import { assertIssuerRoleCanReview, assertPlatformAdminCannotDecrypt } from '../src/lib/document-requestsCore.mjs';
import { createDocumentRequest } from '../src/lib/document-requests.js';
import { normalizeEncryptedPrivateField } from '../src/lib/security/encryptedFields.js';
import { encryptDocumentRequestField } from '../src/lib/document-request-wrap-encrypt.mjs';
import {
	approveIssuerDocumentRequest,
	denyIssuerDocumentRequest,
	getIssuerDocumentRequestDetail,
	issueIssuerDocumentRequest,
	listIssuerDocumentRequests,
} from '../src/lib/document-request-issuer.js';

const TENANT_A = 'tenant_issuer_a';
const TENANT_B = 'tenant_issuer_b';
const ISSUER_A = 'issuer_a';
const ISSUER_B = 'issuer_b';
const TYPE_A = 'type_a';
const TYPE_B = 'type_b';
const KEY_REF = 'ztpf_tenant_issuer_a_testkeyref';
const OWNER_A = 'owner_a';
const OWNER_B = 'owner_b';
const STAFF_USER = 'issuer_staff_a';

function buildEncryptedFields({ requestId, tenantId, ownerUserId, values }) {
	return Object.entries(values).map(([fieldKey, plaintext]) =>
		normalizeEncryptedPrivateField({
			...encryptDocumentRequestField({
				tenantId,
				recordType: DOCUMENT_REQUEST_RECORD_TYPE,
				recordId: requestId,
				fieldKey,
				keyRef: KEY_REF,
				plaintext,
			}),
			ownerUserId,
		}),
	);
}

async function seedIssuerRequest({
	requestId = crypto.randomUUID(),
	tenantId = TENANT_A,
	issuerId = ISSUER_A,
	documentTypeId = TYPE_A,
	ownerUserId = OWNER_A,
	status = DOCUMENT_REQUEST_STATUS.PENDING,
	privateValues = {
		purpose: 'Enrollment verification',
		privateReference: 'STU-2026-0042',
		notes: 'Need official transcript',
	},
} = {}) {
	const encryptedFields = buildEncryptedFields({
		requestId,
		tenantId,
		ownerUserId,
		values: privateValues,
	});

	await prisma.documentRequest.create({
		data: {
			id: requestId,
			tenantId,
			issuerId,
			ownerUserId,
			documentTypeId,
			documentTypeLabel: 'Official Transcript',
			status,
			referenceCode: `REQ-2026-${requestId.slice(0, 8).toUpperCase()}`,
			submittedAt: new Date('2026-02-01T10:00:00.000Z'),
			updatedAt: new Date('2026-02-01T10:00:00.000Z'),
		},
	});

	for (const field of encryptedFields) {
		await prisma.encryptedPrivateField.create({ data: field });
	}

	return requestId;
}

function seedFixtures() {
	resetHarness({
		user: [
			{ id: OWNER_A, signaturaId: 'SIG-A1B2-C3D4' },
			{ id: OWNER_B, signaturaId: 'SIG-E5F6-G7H8' },
			{ id: STAFF_USER, signaturaId: 'SIG-STAF-F001' },
		],
		issuer: [
			{
				id: ISSUER_A,
				tenantId: TENANT_A,
				name: 'University A',
				status: 'active',
				acceptsRequests: true,
			},
			{
				id: ISSUER_B,
				tenantId: TENANT_B,
				name: 'University B',
				status: 'active',
				acceptsRequests: true,
			},
		],
		issuerUser: [
			{
				id: 'issuer_user_a',
				tenantId: TENANT_A,
				issuerId: ISSUER_A,
				userId: STAFF_USER,
				status: 'active',
			},
		],
		documentType: [
			{
				id: TYPE_A,
				tenantId: TENANT_A,
				name: 'Official Transcript',
			},
			{
				id: TYPE_B,
				tenantId: TENANT_B,
				name: 'Diploma',
			},
		],
		documentRecord: [
			{
				id: 'doc_record_123',
				tenantId: TENANT_A,
				issuerId: ISSUER_A,
				externalId: 'EXT-123',
				recipientName: 'Test Recipient',
				issuedAt: new Date('2026-01-10T00:00:00.000Z'),
				hash: 'hash-123',
				verificationToken: 'verify-token-123',
				qrToken: 'qr-token-123',
			},
		],
		privateFieldKeyReference: [
			{
				id: 'key_ref_a',
				tenantId: TENANT_A,
				keyRef: KEY_REF,
				status: 'active',
				algorithm: 'AES-256-GCM',
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
			},
			{
				id: 'key_ref_b',
				tenantId: TENANT_B,
				keyRef: 'ztpf_tenant_issuer_b_testkeyref',
				status: 'active',
				algorithm: 'AES-256-GCM',
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
			},
		],
	});
}

function assertAuditHasNoPrivateContent(action) {
	const audit = prisma.auditLog.__rows.find((entry) => entry.action === action);
	assert.ok(audit, `expected audit action ${action}`);
	const serialized = JSON.stringify(audit.details || {});
	assert.equal(/purpose|privateReference|notes|denialReason|ciphertext/i.test(serialized), false);
	return audit;
}

test('issuer sees only own tenant requests', async () => {
	seedFixtures();
	const requestA = await seedIssuerRequest();
	await seedIssuerRequest({
		tenantId: TENANT_B,
		issuerId: ISSUER_B,
		documentTypeId: TYPE_B,
		ownerUserId: OWNER_B,
	});

	const list = await listIssuerDocumentRequests(TENANT_A);
	assert.equal(list.length, 1);
	assert.equal(list[0].requestId, requestA);
	assert.equal(list[0].ownerDisplayLabel, 'SIG-A1B2-C3D4');
	assert.equal(Object.hasOwn(list[0], 'purpose'), false);
	assert.equal(Object.hasOwn(list[0], 'privateReference'), false);
});

test('issuer detail decrypts private fields', async () => {
	seedFixtures();
	const requestId = await seedIssuerRequest();

	const detail = await getIssuerDocumentRequestDetail({
		requestId,
		tenantId: TENANT_A,
		role: 'ISSUER_STAFF',
	});

	assert.equal(detail.privateFields.purpose, 'Enrollment verification');
	assert.equal(detail.privateFields.privateReference, 'STU-2026-0042');
	assert.equal(detail.privateFields.notes, 'Need official transcript');
	assert.equal(detail.ownerDisplayLabel, 'SIG-A1B2-C3D4');
});

test('platform admin decrypt is blocked', async () => {
	seedFixtures();
	const requestId = await seedIssuerRequest();

	assert.throws(
		() => assertPlatformAdminCannotDecrypt('SIGNATURA_ADMIN'),
		/Provider administrators cannot decrypt/,
	);

	await assert.rejects(
		() =>
			getIssuerDocumentRequestDetail({
				requestId,
				tenantId: TENANT_A,
				role: 'SIGNATURA_ADMIN',
			}),
		/Provider administrators cannot decrypt/,
	);
});

test('owner role decrypt is blocked', async () => {
	seedFixtures();
	const requestId = await seedIssuerRequest();

	assert.throws(
		() => assertIssuerRoleCanReview('DOCUMENT_OWNER'),
		/Issuer staff role required/,
	);

	await assert.rejects(
		() =>
			getIssuerDocumentRequestDetail({
				requestId,
				tenantId: TENANT_A,
				role: 'DOCUMENT_OWNER',
			}),
		/Issuer staff role required/,
	);
});

test('approve pending request works and audits safely', async () => {
	seedFixtures();
	const requestId = await seedIssuerRequest();

	const result = await approveIssuerDocumentRequest({
		requestId,
		tenantId: TENANT_A,
		actorUserId: STAFF_USER,
	});

	assert.equal(result.request.status, DOCUMENT_REQUEST_STATUS.APPROVED);
	const audit = assertAuditHasNoPrivateContent(DOCUMENT_REQUEST_AUDIT_ACTIONS.APPROVED);
	assert.equal(audit.details.requestId, requestId);
});

test('deny pending request works and stores encrypted denial reason', async () => {
	seedFixtures();
	const requestId = await seedIssuerRequest();

	const result = await denyIssuerDocumentRequest({
		requestId,
		tenantId: TENANT_A,
		actorUserId: STAFF_USER,
		denialReason: 'Missing supporting documents',
	});

	assert.equal(result.request.status, DOCUMENT_REQUEST_STATUS.DENIED);
	assertAuditHasNoPrivateContent(DOCUMENT_REQUEST_AUDIT_ACTIONS.DENIED);

	const detail = await getIssuerDocumentRequestDetail({
		requestId,
		tenantId: TENANT_A,
		role: 'ISSUER_ADMIN',
	});
	assert.equal(detail.privateFields.denialReason, 'Missing supporting documents');
});

test('deny approved request works', async () => {
	seedFixtures();
	const requestId = await seedIssuerRequest({
		status: DOCUMENT_REQUEST_STATUS.APPROVED,
	});

	const result = await denyIssuerDocumentRequest({
		requestId,
		tenantId: TENANT_A,
		actorUserId: STAFF_USER,
		denialReason: 'Approval reversed after review',
	});

	assert.equal(result.request.status, DOCUMENT_REQUEST_STATUS.DENIED);
});

test('issue approved request works', async () => {
	seedFixtures();
	const requestId = await seedIssuerRequest({
		status: DOCUMENT_REQUEST_STATUS.APPROVED,
	});

	const result = await issueIssuerDocumentRequest({
		requestId,
		tenantId: TENANT_A,
		actorUserId: STAFF_USER,
		documentRecordId: 'doc_record_123',
		walletDeliveryAvailable: true,
	});

	assert.equal(result.request.status, DOCUMENT_REQUEST_STATUS.ISSUED);
	assert.equal(result.request.issuedDocumentRecordId, 'doc_record_123');
	assert.equal(result.request.walletDelivered, true);
	const audit = assertAuditHasNoPrivateContent(DOCUMENT_REQUEST_AUDIT_ACTIONS.ISSUED);
	assert.equal(audit.details.issuedDocumentRecordId, 'doc_record_123');

	const link = prisma.issuedDocument.__rows.find((row) => row.requestId === requestId);
	assert.ok(link);
	assert.equal(link.documentId, 'doc_record_123');
	assert.equal(link.ownerId, OWNER_A);

	const record = prisma.documentRecord.__rows.find((row) => row.id === 'doc_record_123');
	assert.equal(record.ownerUserId, OWNER_A);
});

test('invalid transitions are rejected', async () => {
	seedFixtures();
	const pendingId = await seedIssuerRequest();
	const approvedId = await seedIssuerRequest({
		status: DOCUMENT_REQUEST_STATUS.APPROVED,
	});
	const issuedId = await seedIssuerRequest({
		status: DOCUMENT_REQUEST_STATUS.ISSUED,
	});

	await assert.rejects(
		() =>
			issueIssuerDocumentRequest({
				requestId: pendingId,
				tenantId: TENANT_A,
				actorUserId: STAFF_USER,
			}),
		/Only approved document requests can be issued/,
	);

	await assert.rejects(
		() =>
			approveIssuerDocumentRequest({
				requestId: issuedId,
				tenantId: TENANT_A,
				actorUserId: STAFF_USER,
			}),
		/Only pending document requests can be approved/,
	);

	await assert.rejects(
		() =>
			denyIssuerDocumentRequest({
				requestId: issuedId,
				tenantId: TENANT_A,
				actorUserId: STAFF_USER,
				denialReason: 'Too late',
			}),
		/Only pending or approved document requests can be denied/,
	);

	await assert.rejects(
		() =>
			approveIssuerDocumentRequest({
				requestId: approvedId,
				tenantId: TENANT_A,
				actorUserId: STAFF_USER,
			}),
		/Only pending document requests can be approved/,
	);
});

test('createDocumentRequest path still works for owner submit regression', async () => {
	seedFixtures();
	const requestId = crypto.randomUUID();
	const result = await createDocumentRequest({
		id: requestId,
		ownerUserId: OWNER_A,
		issuerId: ISSUER_A,
		tenantId: TENANT_A,
		documentTypeId: TYPE_A,
		documentTypeLabel: 'Official Transcript',
		encryptedFields: buildEncryptedFields({
			requestId,
			tenantId: TENANT_A,
			ownerUserId: OWNER_A,
			values: {
				purpose: 'Test',
				privateReference: 'REF-1',
				notes: 'Note',
			},
		}),
	});

	assert.equal(result.request.status, DOCUMENT_REQUEST_STATUS.PENDING);
});
