import test from 'node:test';
import assert from 'node:assert/strict';

import { prisma, resetHarness } from './harness/state.mjs';
import {
	createDocumentRecord,
	findDocumentRecordByVerificationToken,
	getDocumentRecordById,
	listIssuerDocumentRecords,
	summarizeIssuerDocuments,
} from '../src/lib/document-records.js';

const TENANT_ID = 'tenant_doc_records';
const ISSUER_ID = 'issuer_doc_records';
const DOCUMENT_HASH = 'sha256:abc123def456documenthashvalue';

function seedTenantFixtures() {
	resetHarness({
		issuer: [
			{
				id: ISSUER_ID,
				tenantId: TENANT_ID,
				name: 'Record Test University',
				status: 'active',
				acceptsRequests: true,
			},
		],
	});
}

test('createDocumentRecord persists DocumentRecord in Prisma', async () => {
	seedTenantFixtures();

	const result = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
		templateId: 'template_1',
		ownerUserId: 'owner_future',
		documentRequestId: 'request_future',
		documentTypeLabel: 'Transcript',
	});

	assert.match(result.documentId, /^doc_/);
	assert.equal(result.verificationToken.length > 0, true);
	assert.equal(result.qrToken.length > 0, true);

	const stored = prisma.documentRecord.__rows.find((row) => row.id === result.documentId);
	assert.ok(stored);
	assert.equal(stored.tenantId, TENANT_ID);
	assert.equal(stored.issuerId, ISSUER_ID);
	assert.equal(stored.hash, DOCUMENT_HASH);
	assert.equal(stored.documentHash, DOCUMENT_HASH);
	assert.equal(stored.documentTemplateId, 'template_1');
	assert.equal(stored.ownerUserId, 'owner_future');
	assert.equal(stored.documentRequestId, 'request_future');
	assert.equal(stored.documentTypeLabel, 'Transcript');
	assert.equal(stored.status, 'valid');
	assert.equal(stored.anchorStatus, 'pending');
});

test('createDocumentRecord creates anchor pool and verification token rows', async () => {
	seedTenantFixtures();

	const result = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	assert.equal(
		prisma.anchorPool.__rows.some((row) => row.documentId === result.documentId),
		true,
	);
	assert.equal(
		prisma.verificationToken.__rows.some(
			(row) =>
				row.documentRecordId === result.documentId &&
				row.token === result.verificationToken,
		),
		true,
	);
});

test('getDocumentRecordById reads persisted record', async () => {
	seedTenantFixtures();
	const created = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	const record = await getDocumentRecordById(created.documentId, TENANT_ID);
	assert.ok(record);
	assert.equal(record.id, created.documentId);
	assert.equal(record.hash, DOCUMENT_HASH);
});

test('findDocumentRecordByVerificationToken resolves prisma record', async () => {
	seedTenantFixtures();
	const created = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	const located = await findDocumentRecordByVerificationToken({
		tenantId: TENANT_ID,
		token: created.verificationToken,
	});

	assert.equal(located.source, 'prisma');
	assert.equal(located.record.id, created.documentId);
});

test('issuer document list reads from Prisma only', async () => {
	seedTenantFixtures();
	const first = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});
	await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: 'sha256:secondhashvalueforlistquery',
	});

	const { rows, filteredDocuments } = await listIssuerDocumentRecords(TENANT_ID);
	assert.equal(rows.length, 2);
	assert.equal(filteredDocuments.length, 2);
	assert.equal(
		filteredDocuments.some((row) => row.id === first.documentId),
		true,
	);
	assert.equal(filteredDocuments[0].recipientName, '[hidden]');
	assert.equal(Object.hasOwn(filteredDocuments[0], 'hash'), false);

	const summary = summarizeIssuerDocuments(rows);
	assert.equal(summary.totalIssued, 2);
	assert.equal(summary.valid, 2);
});

test('createDocumentRecord rejects missing documentHash', async () => {
	seedTenantFixtures();

	await assert.rejects(
		() =>
			createDocumentRecord({
				tenantId: TENANT_ID,
				documentHash: '',
			}),
		/documentHash is required/,
	);
});
