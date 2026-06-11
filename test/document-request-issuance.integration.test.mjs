import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { prisma, resetHarness } from './harness/state.mjs';
import {
	DOCUMENT_REQUEST_AUDIT_ACTIONS,
	DOCUMENT_REQUEST_STATUS,
	ISSUED_DOCUMENT_DELIVERY_STATUS,
	ISSUED_DOCUMENT_LINKAGE_STATUS,
	ISSUED_DOCUMENT_LINKAGE_TYPE,
} from '../src/lib/document-requests/constants.js';
import { createDocumentRecord } from '../src/lib/document-records.js';
import { issueIssuerDocumentRequest } from '../src/lib/document-request-issuer.js';
import { listOwnerDocumentCredentials } from '../src/lib/document-owner-credentials.js';

const TENANT_A = 'tenant_issue_a';
const TENANT_B = 'tenant_issue_b';
const ISSUER_A = 'issuer_issue_a';
const ISSUER_B = 'issuer_issue_b';
const TYPE_A = 'type_issue_a';
const OWNER_A = 'owner_issue_a';
const OWNER_B = 'owner_issue_b';
const STAFF_USER = 'issuer_staff_issue';
const DOCUMENT_HASH = 'sha256:issued-document-hash-value';

async function seedApprovedRequest({
	requestId = crypto.randomUUID(),
	tenantId = TENANT_A,
	issuerId = ISSUER_A,
	ownerUserId = OWNER_A,
} = {}) {
	await prisma.documentRequest.create({
		data: {
			id: requestId,
			tenantId,
			issuerId,
			ownerUserId,
			documentTypeId: TYPE_A,
			documentTypeLabel: 'Official Transcript',
			status: DOCUMENT_REQUEST_STATUS.APPROVED,
			referenceCode: `REQ-2026-${requestId.slice(0, 8).toUpperCase()}`,
			submittedAt: new Date('2026-02-01T10:00:00.000Z'),
			updatedAt: new Date('2026-02-01T10:00:00.000Z'),
		},
	});
	return requestId;
}

function seedFixtures() {
	resetHarness({
		user: [
			{ id: OWNER_A, signaturaId: 'SIG-OWNR-I001' },
			{ id: OWNER_B, signaturaId: 'SIG-OWNR-I002' },
		],
		issuer: [
			{
				id: ISSUER_A,
				tenantId: TENANT_A,
				name: 'Issue University A',
				status: 'active',
				acceptsRequests: true,
			},
			{
				id: ISSUER_B,
				tenantId: TENANT_B,
				name: 'Issue University B',
				status: 'active',
				acceptsRequests: true,
			},
		],
		documentType: [
			{ id: TYPE_A, tenantId: TENANT_A, name: 'Official Transcript' },
		],
	});
}

function assertAuditHasNoPrivateContent(action) {
	const audit = prisma.auditLog.__rows.find((entry) => entry.action === action);
	assert.ok(audit);
	const serialized = JSON.stringify(audit.details || {});
	assert.equal(/purpose|privateReference|notes|denialReason|ciphertext|hash/i.test(serialized), false);
	return audit;
}

test('issue request by creating new DocumentRecord links owner and wallet delivery', async () => {
	seedFixtures();
	const requestId = await seedApprovedRequest();

	const result = await issueIssuerDocumentRequest({
		requestId,
		tenantId: TENANT_A,
		actorUserId: STAFF_USER,
		documentHash: DOCUMENT_HASH,
		walletDeliveryAvailable: true,
	});

	assert.equal(result.request.status, DOCUMENT_REQUEST_STATUS.ISSUED);
	assert.equal(result.request.walletDelivered, true);
	assert.equal(result.walletDeliveryAvailable, true);
	assert.equal(result.linkageStatus, ISSUED_DOCUMENT_LINKAGE_STATUS.CREATED);
	assert.equal(result.deliveryStatus, ISSUED_DOCUMENT_DELIVERY_STATUS.WALLET_DELIVERED);
	assert.match(result.documentId, /^doc_/);
	assert.match(result.request.issuedDocumentRecordId, /^doc_/);

	const record = prisma.documentRecord.__rows.find(
		(row) => row.id === result.request.issuedDocumentRecordId,
	);
	assert.equal(record.ownerUserId, OWNER_A);
	assert.equal(record.documentRequestId, requestId);
	assert.equal(record.documentTypeLabel, 'Official Transcript');

	const link = prisma.issuedDocument.__rows.find((row) => row.requestId === requestId);
	assert.ok(link);
	assert.equal(link.documentId, result.request.issuedDocumentRecordId);
	assert.equal(link.ownerId, OWNER_A);
	assert.equal(link.deliveryStatus, ISSUED_DOCUMENT_DELIVERY_STATUS.WALLET_DELIVERED);

	const credentials = await listOwnerDocumentCredentials(OWNER_A);
	assert.equal(credentials.length, 1);
	assert.equal(credentials[0].documentId, result.request.issuedDocumentRecordId);
	assert.equal(credentials[0].issuerName, 'Issue University A');
	assert.equal(Object.hasOwn(credentials[0], 'hash'), false);
	assert.equal(Object.hasOwn(credentials[0], 'recipientName'), false);

	assertAuditHasNoPrivateContent(DOCUMENT_REQUEST_AUDIT_ACTIONS.ISSUED);
});

test('issue request by linking existing DocumentRecord', async () => {
	seedFixtures();
	const requestId = await seedApprovedRequest();
	const existing = await createDocumentRecord({
		tenantId: TENANT_A,
		issuerId: ISSUER_A,
		documentHash: DOCUMENT_HASH,
	});

	const result = await issueIssuerDocumentRequest({
		requestId,
		tenantId: TENANT_A,
		actorUserId: STAFF_USER,
		documentRecordId: existing.documentId,
		walletDeliveryAvailable: true,
	});

	assert.equal(result.request.issuedDocumentRecordId, existing.documentId);
	assert.equal(result.request.walletDelivered, true);

	const record = prisma.documentRecord.__rows.find((row) => row.id === existing.documentId);
	assert.equal(record.ownerUserId, OWNER_A);
	assert.equal(record.documentRequestId, requestId);
});

test('reject cross-tenant documentRecordId', async () => {
	seedFixtures();
	const requestId = await seedApprovedRequest();
	const foreign = await createDocumentRecord({
		tenantId: TENANT_B,
		issuerId: ISSUER_B,
		documentHash: DOCUMENT_HASH,
	});

	await assert.rejects(
		() =>
			issueIssuerDocumentRequest({
				requestId,
				tenantId: TENANT_A,
				actorUserId: STAFF_USER,
				documentRecordId: foreign.documentId,
				walletDeliveryAvailable: true,
			}),
		/not found for this issuer tenant/i,
	);
});

test('wallet delivery requires document input', async () => {
	seedFixtures();
	const requestId = await seedApprovedRequest();

	await assert.rejects(
		() =>
			issueIssuerDocumentRequest({
				requestId,
				tenantId: TENANT_A,
				actorUserId: STAFF_USER,
				walletDeliveryAvailable: true,
			}),
		/Wallet delivery requires a document record or document hash/,
	);
});

test('issue without document marks issuer release only', async () => {
	seedFixtures();
	const requestId = await seedApprovedRequest();

	const result = await issueIssuerDocumentRequest({
		requestId,
		tenantId: TENANT_A,
		actorUserId: STAFF_USER,
	});

	assert.equal(result.request.status, DOCUMENT_REQUEST_STATUS.ISSUED);
	assert.equal(result.request.walletDelivered, false);
	assert.equal(result.request.issuedDocumentRecordId, null);
	assert.equal(prisma.issuedDocument.__rows.length, 0);
});

test('linked issue without wallet delivery keeps credentials hidden', async () => {
	seedFixtures();
	const requestId = await seedApprovedRequest();

	const result = await issueIssuerDocumentRequest({
		requestId,
		tenantId: TENANT_A,
		actorUserId: STAFF_USER,
		documentHash: DOCUMENT_HASH,
		walletDeliveryAvailable: false,
	});

	assert.equal(result.request.walletDelivered, false);
	const link = prisma.issuedDocument.__rows.find((row) => row.requestId === requestId);
	assert.equal(link.deliveryStatus, ISSUED_DOCUMENT_DELIVERY_STATUS.ISSUER_RELEASE);

	const credentials = await listOwnerDocumentCredentials(OWNER_A);
	assert.equal(credentials.length, 0);
});

test('failed linkage does not leave orphan DocumentRecord', async () => {
	seedFixtures();
	const requestId = await seedApprovedRequest();

	await prisma.issuedDocument.create({
		data: {
			id: 'existing_link_collision',
			tenantId: TENANT_A,
			requestId,
			documentId: 'doc_collision_existing',
			issuerId: ISSUER_A,
			ownerId: OWNER_A,
			issuedAt: new Date('2026-02-02T10:00:00.000Z'),
			deliveryStatus: ISSUED_DOCUMENT_DELIVERY_STATUS.ISSUER_RELEASE,
			linkageType: ISSUED_DOCUMENT_LINKAGE_TYPE.LINKED,
		},
	});

	const recordCountBefore = prisma.documentRecord.__rows.length;
	const anchorPoolCountBefore = prisma.anchorPool.__rows.length;
	const verificationTokenCountBefore = prisma.verificationToken.__rows.length;

	await assert.rejects(
		() =>
			issueIssuerDocumentRequest({
				requestId,
				tenantId: TENANT_A,
				actorUserId: STAFF_USER,
				documentHash: DOCUMENT_HASH,
				walletDeliveryAvailable: true,
			}),
		/Unique constraint failed on the field: requestId/,
	);

	assert.equal(prisma.documentRecord.__rows.length, recordCountBefore);
	assert.equal(prisma.anchorPool.__rows.length, anchorPoolCountBefore);
	assert.equal(prisma.verificationToken.__rows.length, verificationTokenCountBefore);

	const request = prisma.documentRequest.__rows.find((row) => row.id === requestId);
	assert.equal(request.status, DOCUMENT_REQUEST_STATUS.APPROVED);
	assert.notEqual(request.status, DOCUMENT_REQUEST_STATUS.ISSUED);
	assert.equal(Boolean(request.walletDelivered), false);
});

test('cross-tenant linkage rejection does not modify DocumentRecord', async () => {
	seedFixtures();
	const requestId = await seedApprovedRequest();
	const foreign = await createDocumentRecord({
		tenantId: TENANT_B,
		issuerId: ISSUER_B,
		documentHash: DOCUMENT_HASH,
	});

	const foreignBefore = prisma.documentRecord.__rows.find(
		(row) => row.id === foreign.documentId,
	);
	assert.equal(foreignBefore.ownerUserId, null);
	assert.equal(foreignBefore.documentRequestId, null);

	await assert.rejects(
		() =>
			issueIssuerDocumentRequest({
				requestId,
				tenantId: TENANT_A,
				actorUserId: STAFF_USER,
				documentRecordId: foreign.documentId,
				walletDeliveryAvailable: true,
			}),
		/not found for this issuer tenant/i,
	);

	const foreignAfter = prisma.documentRecord.__rows.find(
		(row) => row.id === foreign.documentId,
	);
	assert.equal(foreignAfter.ownerUserId, null);
	assert.equal(foreignAfter.documentRequestId, null);
});

test('owner document list returns only own wallet-delivered documents', async () => {
	seedFixtures();
	const requestA = await seedApprovedRequest({ ownerUserId: OWNER_A });
	const requestB = await seedApprovedRequest({
		requestId: crypto.randomUUID(),
		ownerUserId: OWNER_B,
	});

	await issueIssuerDocumentRequest({
		requestId: requestA,
		tenantId: TENANT_A,
		actorUserId: STAFF_USER,
		documentHash: DOCUMENT_HASH,
		walletDeliveryAvailable: true,
	});
	await issueIssuerDocumentRequest({
		requestId: requestB,
		tenantId: TENANT_A,
		actorUserId: STAFF_USER,
		documentHash: 'sha256:owner-b-document-hash',
		walletDeliveryAvailable: true,
	});

	const ownerAList = await listOwnerDocumentCredentials(OWNER_A);
	const ownerBList = await listOwnerDocumentCredentials(OWNER_B);

	assert.equal(ownerAList.length, 1);
	assert.equal(ownerBList.length, 1);
	assert.notEqual(ownerAList[0].documentId, ownerBList[0].documentId);
});
