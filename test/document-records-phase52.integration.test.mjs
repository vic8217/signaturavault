import test from 'node:test';
import assert from 'node:assert/strict';

import { prisma, resetHarness } from './harness/state.mjs';
import {
	createDocumentRecord,
	findDocumentRecordByHash,
	findDocumentRecordByVerificationToken,
	findJsonDocumentRecordByHash,
	findJsonDocumentRecordByToken,
	listMergedIssuerDocumentRecords,
	revokeDocumentRecord,
	rotateDocumentQrToken,
	verifyPublicDocumentByToken,
} from '../src/lib/document-records.js';

const TENANT_ID = 'tenant_phase52';
const OTHER_TENANT_ID = 'tenant_phase52_other';
const ISSUER_ID = 'issuer_phase52';
const DOCUMENT_HASH = 'sha256:phase52hashvalueforverification';

function seedTenantFixtures() {
	resetHarness({
		issuer: [
			{
				id: ISSUER_ID,
				tenantId: TENANT_ID,
				name: 'Phase 5.2 University',
				status: 'active',
				acceptsRequests: true,
			},
			{
				id: 'issuer_phase52_other',
				tenantId: OTHER_TENANT_ID,
				name: 'Other Tenant University',
				status: 'active',
				acceptsRequests: true,
			},
		],
	});
}

test('verify Prisma record by verification token via public verify', async () => {
	seedTenantFixtures();
	const created = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	const result = await verifyPublicDocumentByToken(created.verificationToken);
	assert.equal(result.status, 200);
	assert.equal(result.body.document_id, created.documentId);
	assert.equal(result.body.private_data_redacted, true);
	assert.equal(result.body.external_id, '[redacted]');
	assert.equal(result.body.recipient_name, '[redacted]');
	assert.equal(result.body.document_hash_match, true);
});

test('verify Prisma record by QR token via tenant lookup', async () => {
	seedTenantFixtures();
	const created = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	const located = await findDocumentRecordByVerificationToken({
		tenantId: TENANT_ID,
		token: created.qrToken,
	});

	assert.equal(located.source, 'prisma');
	assert.equal(located.record.id, created.documentId);
});

test('hash lookup finds Prisma record', async () => {
	seedTenantFixtures();
	const created = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	const located = await findDocumentRecordByHash({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	assert.equal(located.source, 'prisma');
	assert.equal(located.record.id, created.documentId);
});

test('legacy JSON fallback still works for token and hash lookup', () => {
	const legacyDb = {
		document_records: [
			{
				id: 'doc_legacy_json',
				tenant_id: TENANT_ID,
				hash: 'sha256:legacyjsonhashvalue',
				document_hash: 'sha256:legacyjsonhashvalue',
				verification_token: 'verify_legacy_token',
				qr_token: 'qr_legacy_token',
				status: 'valid',
				anchor_status: 'pending',
			},
		],
	};

	const byToken = findJsonDocumentRecordByToken(
		legacyDb,
		TENANT_ID,
		'verify_legacy_token',
	);
	assert.equal(byToken.id, 'doc_legacy_json');

	const byQr = findJsonDocumentRecordByToken(legacyDb, TENANT_ID, 'qr_legacy_token');
	assert.equal(byQr.id, 'doc_legacy_json');

	const byHash = findJsonDocumentRecordByHash(
		legacyDb,
		TENANT_ID,
		'sha256:legacyjsonhashvalue',
	);
	assert.equal(byHash.id, 'doc_legacy_json');
});

test('issuer can revoke own Prisma document and audit event is recorded', async () => {
	seedTenantFixtures();
	const created = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	const result = await revokeDocumentRecord({
		tenantId: TENANT_ID,
		documentId: created.documentId,
		reason: 'compromised credential',
		userId: 'issuer_user_1',
		issuerId: ISSUER_ID,
	});

	assert.equal(result.status, 200);
	assert.equal(result.body.status, 'revoked');

	const stored = prisma.documentRecord.__rows.find((row) => row.id === created.documentId);
	assert.equal(stored.status, 'revoked');

	const audit = prisma.auditLog.__rows.find(
		(entry) =>
			entry.action === 'document_revoked' && entry.target === created.documentId,
	);
	assert.ok(audit);
	assert.equal(audit.tenantId, TENANT_ID);
});

test('issuer cannot revoke cross-tenant Prisma document', async () => {
	seedTenantFixtures();
	const created = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	const result = await revokeDocumentRecord({
		tenantId: OTHER_TENANT_ID,
		documentId: created.documentId,
		reason: 'cross-tenant attempt',
		userId: 'issuer_user_other',
	});

	assert.equal(result.status, 404);
	assert.equal(result.error, 'Document not found');

	const stored = prisma.documentRecord.__rows.find((row) => row.id === created.documentId);
	assert.equal(stored.status, 'valid');
});

test('issuer list includes Prisma documents via merged list', async () => {
	seedTenantFixtures();
	const created = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	const { rows, filteredDocuments } = await listMergedIssuerDocumentRecords(TENANT_ID);
	assert.equal(rows.some((row) => row.id === created.documentId), true);
	assert.equal(
		filteredDocuments.some((row) => row.id === created.documentId),
		true,
	);
});

test('merged counts do not double-count same record id', async () => {
	seedTenantFixtures();
	const created = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	const prismaIds = new Set(prisma.documentRecord.__rows.map((row) => row.id));
	const legacyDb = {
		document_records: [
			{
				id: created.documentId,
				tenant_id: TENANT_ID,
				hash: DOCUMENT_HASH,
				status: 'valid',
				anchor_status: 'pending',
			},
			{
				id: 'doc_legacy_only',
				tenant_id: TENANT_ID,
				hash: 'sha256:legacyonlyhash',
				status: 'valid',
				anchor_status: 'pending',
			},
		],
	};

	const legacyOnly = (legacyDb.document_records || []).filter(
		(record) => record.tenant_id === TENANT_ID && !prismaIds.has(record.id),
	);
	assert.equal(legacyOnly.length, 1);
	assert.equal(legacyOnly[0].id, 'doc_legacy_only');

	const { rows } = await listMergedIssuerDocumentRecords(TENANT_ID);
	const ids = rows.map((row) => row.id);
	assert.equal(new Set(ids).size, ids.length);
	assert.equal(rows.filter((row) => row.id === created.documentId).length, 1);
});

test('QR rotation updates Prisma record token', async () => {
	seedTenantFixtures();
	const created = await createDocumentRecord({
		tenantId: TENANT_ID,
		documentHash: DOCUMENT_HASH,
	});

	const result = await rotateDocumentQrToken({
		tenantId: TENANT_ID,
		documentId: created.documentId,
	});

	assert.equal(result.status, 200);
	assert.notEqual(result.body.qrToken, created.qrToken);

	const stored = prisma.documentRecord.__rows.find((row) => row.id === created.documentId);
	assert.equal(stored.qrToken, result.body.qrToken);
});
