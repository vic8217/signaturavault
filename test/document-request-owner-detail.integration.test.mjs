import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { prisma, resetHarness } from './harness/state.mjs';
import { DOCUMENT_REQUEST_RECORD_TYPE, DOCUMENT_REQUEST_STATUS } from '../src/lib/document-requests/constants.js';
import { assertPlatformAdminCannotDecrypt } from '../src/lib/document-requestsCore.mjs';
import { normalizeEncryptedPrivateField } from '../src/lib/security/encryptedFields.js';
import { encryptDocumentRequestField } from '../src/lib/document-request-wrap-encrypt.mjs';
import {
	assertOwnerCanReadDenialReason,
	getOwnerDocumentRequestDetail,
} from '../src/lib/document-request-owner.js';
import { issueIssuerDocumentRequest } from '../src/lib/document-request-issuer.js';
import { resolveValidatedIssuedDocumentRecordId } from '../src/lib/document-request-record-validation.js';

const TENANT_ID = 'tenant_owner_detail';
const ISSUER_ID = 'issuer_owner_detail';
const TYPE_ID = 'type_owner_detail';
const OWNER_A = 'owner_detail_a';
const OWNER_B = 'owner_detail_b';
const KEY_REF = 'ztpf_tenant_owner_detail_key';
const DOC_RECORD_ID = 'doc_record_valid';

function buildDenialField({ requestId, tenantId, ownerUserId, reason }) {
	return normalizeEncryptedPrivateField({
		...encryptDocumentRequestField({
			tenantId,
			recordType: DOCUMENT_REQUEST_RECORD_TYPE,
			recordId: requestId,
			fieldKey: 'denial_reason',
			keyRef: KEY_REF,
			plaintext: reason,
		}),
		ownerUserId,
	});
}

function seedFixtures() {
	resetHarness({
		user: [
			{ id: OWNER_A, signaturaId: 'SIG-OWNR-A001' },
			{ id: OWNER_B, signaturaId: 'SIG-OWNR-B002' },
		],
		issuer: [
			{
				id: ISSUER_ID,
				tenantId: TENANT_ID,
				name: 'Detail Test University',
				status: 'active',
				acceptsRequests: true,
			},
		],
		documentType: [
			{
				id: TYPE_ID,
				tenantId: TENANT_ID,
				name: 'Transcript',
			},
		],
		privateFieldKeyReference: [
			{
				id: 'key_ref_owner_detail',
				tenantId: TENANT_ID,
				keyRef: KEY_REF,
				status: 'active',
				algorithm: 'AES-256-GCM',
				createdAt: new Date('2026-01-01T00:00:00.000Z'),
			},
		],
		documentRecord: [
			{
				id: DOC_RECORD_ID,
				tenantId: TENANT_ID,
				issuerId: ISSUER_ID,
				externalId: 'EXT-001',
				recipientName: 'Test Recipient',
				issuedAt: new Date('2026-01-15T00:00:00.000Z'),
				hash: 'hash-valid',
				verificationToken: 'verify-token-valid',
				qrToken: 'qr-token-valid',
			},
		],
	});
}

async function seedRequest({
	requestId = crypto.randomUUID(),
	ownerUserId = OWNER_A,
	status = DOCUMENT_REQUEST_STATUS.PENDING,
	walletDelivered = false,
	denialReason = null,
} = {}) {
	await prisma.documentRequest.create({
		data: {
			id: requestId,
			tenantId: TENANT_ID,
			issuerId: ISSUER_ID,
			ownerUserId,
			documentTypeId: TYPE_ID,
			documentTypeLabel: 'Transcript',
			status,
			referenceCode: `REQ-2026-${requestId.slice(0, 8).toUpperCase()}`,
			walletDelivered,
			submittedAt: new Date('2026-02-01T10:00:00.000Z'),
			updatedAt: new Date('2026-02-01T10:00:00.000Z'),
		},
	});

	if (status === DOCUMENT_REQUEST_STATUS.DENIED && denialReason) {
		await prisma.encryptedPrivateField.create({
			data: buildDenialField({
				requestId,
				tenantId: TENANT_ID,
				ownerUserId,
				reason: denialReason,
			}),
		});
	}
}

test('owner can read own request detail', async () => {
	seedFixtures();
	const requestId = crypto.randomUUID();
	await seedRequest({
		requestId,
		status: DOCUMENT_REQUEST_STATUS.APPROVED,
	});

	const detail = await getOwnerDocumentRequestDetail({
		requestId,
		ownerUserId: OWNER_A,
		role: 'DOCUMENT_OWNER',
	});

	assert.equal(detail.requestId, requestId);
	assert.equal(detail.issuerDisplayName, 'Detail Test University');
	assert.equal(detail.documentTypeLabel, 'Transcript');
	assert.equal(detail.status, DOCUMENT_REQUEST_STATUS.APPROVED);
	assert.equal(Object.hasOwn(detail, 'purpose'), false);
	assert.equal(Object.hasOwn(detail, 'notes'), false);
	assert.equal(Object.hasOwn(detail, 'privateReference'), false);
});

test('owner cannot read another owner request detail', async () => {
	seedFixtures();
	const requestId = crypto.randomUUID();
	await seedRequest({ requestId, ownerUserId: OWNER_A });

	await assert.rejects(
		() =>
			getOwnerDocumentRequestDetail({
				requestId,
				ownerUserId: OWNER_B,
				role: 'DOCUMENT_OWNER',
			}),
		/not found/i,
	);
});

test('denied owner can see denial reason', async () => {
	seedFixtures();
	const requestId = crypto.randomUUID();
	await seedRequest({
		requestId,
		status: DOCUMENT_REQUEST_STATUS.DENIED,
		denialReason: 'Incomplete supporting documents',
	});

	const detail = await getOwnerDocumentRequestDetail({
		requestId,
		ownerUserId: OWNER_A,
		role: 'DOCUMENT_OWNER',
	});

	assert.equal(detail.status, DOCUMENT_REQUEST_STATUS.DENIED);
	assert.equal(detail.denialReason, 'Incomplete supporting documents');
	assert.match(detail.statusMessage, /denied/i);
});

test('non-denied owner does not see denial reason', async () => {
	seedFixtures();
	const requestId = crypto.randomUUID();
	await seedRequest({
		requestId,
		status: DOCUMENT_REQUEST_STATUS.PENDING,
	});

	const detail = await getOwnerDocumentRequestDetail({
		requestId,
		ownerUserId: OWNER_A,
		role: 'DOCUMENT_OWNER',
	});

	assert.equal(Object.hasOwn(detail, 'denialReason'), false);
});

test('platform admin cannot decrypt denial reason', async () => {
	seedFixtures();
	const requestId = crypto.randomUUID();
	await seedRequest({
		requestId,
		status: DOCUMENT_REQUEST_STATUS.DENIED,
		denialReason: 'Sensitive issuer note',
	});

	assert.throws(
		() => assertOwnerCanReadDenialReason('SIGNATURA_ADMIN'),
		/Provider administrators cannot decrypt/,
	);

	await assert.rejects(
		() =>
			getOwnerDocumentRequestDetail({
				requestId,
				ownerUserId: OWNER_A,
				role: 'SIGNATURA_ADMIN',
			}),
		/Provider administrators cannot decrypt/,
	);

	assert.throws(
		() => assertPlatformAdminCannotDecrypt('SIGNATURA_STAFF'),
		/Provider administrators cannot decrypt/,
	);
});

test('issued owner detail shows wallet delivery messaging', async () => {
	seedFixtures();
	const deliveredId = crypto.randomUUID();
	const pendingDeliveryId = crypto.randomUUID();

	await seedRequest({
		requestId: deliveredId,
		status: DOCUMENT_REQUEST_STATUS.ISSUED,
		walletDelivered: true,
	});
	await seedRequest({
		requestId: pendingDeliveryId,
		status: DOCUMENT_REQUEST_STATUS.ISSUED,
		walletDelivered: false,
	});

	const delivered = await getOwnerDocumentRequestDetail({
		requestId: deliveredId,
		ownerUserId: OWNER_A,
		role: 'DOCUMENT_OWNER',
	});
	const pendingDelivery = await getOwnerDocumentRequestDetail({
		requestId: pendingDeliveryId,
		ownerUserId: OWNER_A,
		role: 'DOCUMENT_OWNER',
	});

	assert.equal(delivered.walletDeliveryAvailable, true);
	assert.match(delivered.statusMessage, /Signatura wallet/);
	assert.equal(pendingDelivery.walletDeliveryAvailable, false);
	assert.match(pendingDelivery.statusMessage, /ready for issuer release/);
});

test('documentRecordId validation accepts tenant document record', async () => {
	seedFixtures();

	const validated = await resolveValidatedIssuedDocumentRecordId({
		documentRecordId: DOC_RECORD_ID,
		tenantId: TENANT_ID,
		issuerId: ISSUER_ID,
	});

	assert.equal(validated, DOC_RECORD_ID);
});

test('documentRecordId validation rejects unknown record', async () => {
	seedFixtures();

	await assert.rejects(
		() =>
			resolveValidatedIssuedDocumentRecordId({
				documentRecordId: 'missing-record',
				tenantId: TENANT_ID,
				issuerId: ISSUER_ID,
			}),
		/not found for this issuer tenant/i,
	);
});

test('issue with valid documentRecordId links record', async () => {
	seedFixtures();
	const requestId = crypto.randomUUID();
	await seedRequest({
		requestId,
		status: DOCUMENT_REQUEST_STATUS.APPROVED,
	});

	const result = await issueIssuerDocumentRequest({
		requestId,
		tenantId: TENANT_ID,
		actorUserId: 'issuer_staff',
		documentRecordId: DOC_RECORD_ID,
		walletDeliveryAvailable: true,
	});

	assert.equal(result.request.issuedDocumentRecordId, DOC_RECORD_ID);
	assert.equal(prisma.issuedDocument.__rows.length, 1);
});

test('issue with invalid documentRecordId is rejected', async () => {
	seedFixtures();
	const requestId = crypto.randomUUID();
	await seedRequest({
		requestId,
		status: DOCUMENT_REQUEST_STATUS.APPROVED,
	});

	await assert.rejects(
		() =>
			issueIssuerDocumentRequest({
				requestId,
				tenantId: TENANT_ID,
				actorUserId: 'issuer_staff',
				documentRecordId: 'invalid-record-id',
			}),
		/not found for this issuer tenant/i,
	);
});
