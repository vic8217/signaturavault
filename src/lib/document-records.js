import crypto from 'crypto';

import {
	documentLeafHash,
	verifyMerkleProof,
} from '@/lib/anchoring/merkle';
import { verifyBatchPublicCommitment } from '@/lib/anchoring/batchService';
import { auditEvent } from '@/lib/audit';
import { generateId, loadDb, now, saveDb } from '@/lib/db';
import { prisma } from '@/lib/prisma';
import { REDACTED, redactForLog, redactedDocumentVerification } from '@/lib/security';

const VERIFICATION_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const HIDDEN_RECIPIENT = '[hidden]';

function generateRecordId(prefix = 'doc') {
	return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function normalizeDocumentHash(value) {
	const normalized = String(value || '').trim();
	if (!normalized) {
		throw new Error('documentHash is required');
	}
	return normalized;
}

function shortHash(value) {
	if (!value) return '';
	if (value.length <= 18) return value;
	return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function lower(value) {
	return String(value || '').toLowerCase();
}

function prismaRecordToVerificationShape(record) {
	return {
		id: record.id,
		tenant_id: record.tenantId,
		tenantId: record.tenantId,
		hash: record.hash,
		document_hash: record.documentHash || record.hash,
		documentHash: record.documentHash || record.hash,
		status: record.status,
		anchor_status: record.anchorStatus,
		anchorStatus: record.anchorStatus,
		verification_token: record.verificationToken,
		verificationToken: record.verificationToken,
		qr_token: record.qrToken,
		qrToken: record.qrToken,
		issued_at: record.issuedAt,
		issuedAt: record.issuedAt,
	};
}

function jsonRecordToVerificationShape(record) {
	return {
		...record,
		document_hash: record.document_hash || record.hash,
	};
}

function getAnchorStatusFromBatch(document, batch) {
	if (!batch) return document.anchorStatus || document.anchor_status || 'pending';
	if (batch.status === 'published') return 'published';
	if (
		batch.publishMethod === 'opentimestamps' &&
		batch.status === 'timestamped_pending_confirmation'
	) {
		return 'published';
	}
	if (batch.publish_method === 'opentimestamps' && batch.status === 'timestamped_pending_confirmation') {
		return 'published';
	}
	return batch.status || document.anchorStatus || document.anchor_status || 'pending';
}

function verifyMerkleProofForDocument(document, proof, batch) {
	if (!proof || !batch) {
		return { proof: null, batch: null, valid: false };
	}

	const storedHash = document.documentHash || document.document_hash || document.hash;
	const leafHash = documentLeafHash(storedHash, document.id);
	const proofPath = proof.proofPath || proof.proof_path;
	const merkleRoot = batch.merkleRoot || batch.merkle_root;
	const proofLeafHash = proof.leafHash || proof.leaf_hash;

	const valid =
		leafHash === proofLeafHash &&
		verifyMerkleProof({
			leafHash,
			proofPath,
			merkleRoot,
		});

	return { proof, batch, valid, leafHash };
}

async function findPrismaMerkleContext(documentId) {
	const proof = await prisma.merkleProof.findFirst({
		where: { documentId },
		orderBy: { createdAt: 'desc' },
	});

	if (!proof) {
		return { proof: null, batch: null, valid: false };
	}

	const batch = await prisma.merkleBatch.findFirst({
		where: { id: proof.batchId },
	});

	const record = await prisma.documentRecord.findFirst({
		where: { id: documentId },
		select: { id: true, hash: true, documentHash: true },
	});

	return verifyMerkleProofForDocument(record || { id: documentId }, proof, batch);
}

function findJsonMerkleContext(db, document) {
	const proof = (db.merkle_proofs || []).find((item) => item.document_id === document.id);
	if (!proof) return { proof: null, batch: null, valid: false };
	const batch = (db.merkle_batches || []).find((item) => item.id === proof.batch_id);
	return verifyMerkleProofForDocument(document, proof, batch);
}

async function resolveIssuerIdForTenant(tenantId, issuerId) {
	if (issuerId) return issuerId;

	const issuer = await prisma.issuer.findFirst({
		where: {
			tenantId,
			status: 'active',
		},
		orderBy: { createdAt: 'asc' },
		select: { id: true },
	});

	return issuer?.id || null;
}

async function createDocumentRecordWithClient(tx, input = {}, auditContext = {}) {
	const tenantId = String(input.tenantId || '').trim();
	const documentHash = normalizeDocumentHash(input.documentHash);
	const documentTemplateId =
		String(input.documentTemplateId || input.templateId || '').trim() || null;
	const issuerId = input.issuerId
		? String(input.issuerId).trim()
		: await resolveIssuerIdForTenant(tenantId, null);
	const ownerUserId = String(input.ownerUserId || '').trim() || null;
	const documentRequestId = String(input.documentRequestId || '').trim() || null;
	const documentTypeLabel = String(input.documentTypeLabel || '').trim() || null;

	if (!tenantId) {
		throw new Error('tenantId is required');
	}

	const documentId = input.id || generateRecordId('doc');
	const verificationToken = input.verificationToken || generateRecordId('verify');
	const qrToken = input.qrToken || generateRecordId('qr');
	const issuedAt = input.issuedAt ? new Date(input.issuedAt) : new Date();
	const externalId = String(input.externalId || documentId).trim();

	const created = await tx.documentRecord.create({
		data: {
			id: documentId,
			tenantId,
			issuerId,
			documentTemplateId,
			externalId,
			recipientName: String(input.recipientName || HIDDEN_RECIPIENT).trim() || HIDDEN_RECIPIENT,
			issuedAt,
			hash: documentHash,
			documentHash,
			status: 'valid',
			verificationToken,
			qrToken,
			anchorStatus: 'pending',
			anchorBatchId: null,
			ownerUserId,
			documentRequestId,
			documentTypeLabel,
			metadata: input.metadata ?? null,
		},
	});

	await tx.anchorPool.create({
		data: {
			id: generateRecordId('pool'),
			documentId: created.id,
			documentHash,
			status: 'pending',
		},
	});

	await tx.verificationToken.create({
		data: {
			id: generateRecordId('verif'),
			tenantId,
			documentRecordId: created.id,
			token: verificationToken,
			expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
			status: 'active',
		},
	});

	if (auditContext.apiClientId) {
		await tx.apiLog.create({
			data: {
				id: generateRecordId('apilog'),
				tenantId,
				apiClientId: auditContext.apiClientId,
				path: auditContext.path || '/api/issuers/documents',
				method: auditContext.method || 'POST',
				status: 201,
				requestBody: {
					action: 'document_created',
					documentId: created.id,
					templateId: documentTemplateId,
					privateFieldsStoredAsPlaintext: false,
				},
				responseBody: {
					documentId: created.id,
					status: created.status,
					anchorStatus: created.anchorStatus,
				},
			},
		});
	}

	return {
		record: created,
		documentId: created.id,
		verificationToken: created.verificationToken,
		qrToken: created.qrToken,
	};
}

async function createDocumentRecord(input = {}, auditContext = {}) {
	const issuerId = await resolveIssuerIdForTenant(
		String(input.tenantId || '').trim(),
		input.issuerId,
	);

	const result = await prisma.$transaction(async (tx) =>
		createDocumentRecordWithClient(
			tx,
			{
				...input,
				issuerId: issuerId || input.issuerId,
			},
			auditContext,
		),
	);

	return result;
}

async function getDocumentRecordById(documentId, tenantId) {
	return prisma.documentRecord.findFirst({
		where: {
			id: documentId,
			...(tenantId ? { tenantId } : {}),
		},
	});
}

async function findDocumentRecordByVerificationToken({ tenantId, token }) {
	const normalizedToken = String(token || '').trim();
	if (!normalizedToken) {
		throw new Error('token is required');
	}

	const prismaRecord =
		(await prisma.documentRecord.findFirst({
			where: {
				tenantId,
				verificationToken: normalizedToken,
			},
		})) ||
		(await prisma.documentRecord.findFirst({
			where: {
				tenantId,
				qrToken: normalizedToken,
			},
		}));

	if (prismaRecord) {
		return {
			source: 'prisma',
			record: prismaRecord,
		};
	}

	const db = await loadDb();
	const jsonRecord = (db.document_records || []).find(
		(doc) =>
			doc.tenant_id === tenantId &&
			(doc.verification_token === normalizedToken || doc.qr_token === normalizedToken),
	);

	if (jsonRecord) {
		console.warn(
			'[document-records] Legacy JSON document record used for verification (read-only compatibility).',
		);
		return {
			source: 'json',
			record: jsonRecord,
			db,
		};
	}

	return null;
}

async function verifyTenantDocumentRecord({ tenantId, token }) {
	const located = await findDocumentRecordByVerificationToken({ tenantId, token });
	if (!located) {
		return { error: 'Verification token not found', status: 404 };
	}

	if (located.source === 'prisma') {
		const record = located.record;
		const storedHash = record.documentHash || record.hash;
		const documentHashMatch = Boolean(storedHash && storedHash === record.hash);
		const { proof, batch, valid: merkleProofValid } = await findPrismaMerkleContext(record.id);
		const commitmentVerification = batch ? verifyBatchPublicCommitment(batch) : { verified: false };
		const publicCommitmentValid = Boolean(
			merkleProofValid && commitmentVerification.verified,
		);

		const tokenRow = await prisma.verificationToken.findFirst({
			where: {
				token,
				documentRecordId: record.id,
			},
		});
		const tokenValid =
			(record.verificationToken === token || record.qrToken === token) &&
			(!tokenRow ||
				(tokenRow.status === 'active' && tokenRow.expiresAt > new Date()));

		if (!documentHashMatch || !proof || !batch) {
			return {
				status: 400,
				body: {
					tokenValid,
					documentHashMatch,
					documentStatus: record.status,
					anchorStatus: record.anchorStatus || 'pending',
					merkleProofValid: false,
					publicCommitmentValid: false,
					error: 'Document hash mismatch or Merkle proof missing',
				},
			};
		}

		const documentStatus = record.status === 'revoked' ? 'revoked' : record.status;

		return {
			status: 200,
			body: {
				tokenValid,
				documentHashMatch,
				documentStatus,
				anchorStatus: record.anchorStatus || 'pending',
				merkleProofValid,
				publicCommitmentValid,
				publishMethod: batch.publishMethod,
				chain: commitmentVerification.chain || batch.chain,
				batchId: batch.id,
				merkleRoot: batch.merkleRoot,
				transactionId: batch.transactionId,
				blockNumber: commitmentVerification.blockNumber || batch.blockNumber,
				anchorCommitmentAvailable: Boolean(batch.timestampProof),
				legacyAnchor: Boolean(commitmentVerification.legacy),
				...redactedDocumentVerification(prismaRecordToVerificationShape(record)),
				status: documentStatus,
				qrToken: record.qrToken,
			},
		};
	}

	const db = located.db;
	const record = located.record;
	const storedHash = record.document_hash || record.hash;
	const documentHashMatch = Boolean(storedHash && storedHash === record.hash);
	const { proof, batch, valid: merkleProofValid } = findJsonMerkleContext(db, record);
	const commitmentVerification = batch ? verifyBatchPublicCommitment(batch) : { verified: false };
	const publicCommitmentValid = Boolean(merkleProofValid && commitmentVerification.verified);
	const tokenRow = (db.verification_tokens || []).find(
		(item) => item.token === token && item.document_record_id === record.id,
	);
	const tokenValid =
		(record.verification_token === token || record.qr_token === token) &&
		(!tokenRow ||
			(tokenRow.status === 'active' && new Date(tokenRow.expires_at) > new Date()));

	if (!documentHashMatch || !proof || !batch) {
		return {
			status: 400,
			body: {
				tokenValid,
				documentHashMatch,
				documentStatus: record.status || 'valid',
				anchorStatus: record.anchor_status || 'pending',
				merkleProofValid: false,
				publicCommitmentValid: false,
				error: 'Document hash mismatch or Merkle proof missing',
			},
		};
	}

	const documentStatus = record.status === 'revoked' ? 'revoked' : record.status || 'valid';

	return {
		status: 200,
		body: {
			tokenValid,
			documentHashMatch,
			documentStatus,
			anchorStatus: record.anchor_status || 'pending',
			merkleProofValid,
			publicCommitmentValid,
			publishMethod: batch.publish_method,
			chain: commitmentVerification.chain || batch.chain,
			batchId: batch.id,
			merkleRoot: batch.merkle_root,
			transactionId: batch.transaction_id,
			blockNumber: commitmentVerification.blockNumber || batch.block_number,
			anchorCommitmentAvailable: Boolean(batch.timestamp_proof),
			legacyAnchor: Boolean(commitmentVerification.legacy),
			...redactedDocumentVerification(jsonRecordToVerificationShape(record)),
			status: documentStatus,
			qrToken: record.qr_token,
		},
	};
}

async function listIssuerDocumentRecords(tenantId, filters = {}) {
	const search = lower(filters.search);
	const documentStatus = filters.status || 'all';
	const anchorPublishStatus =
		filters.anchorStatus || filters.otsStatus || 'all';

	const records = await prisma.documentRecord.findMany({
		where: { tenantId },
		orderBy: { issuedAt: 'desc' },
	});

	const documentIds = records.map((record) => record.id);
	const proofs = documentIds.length
		? await prisma.merkleProof.findMany({
				where: { documentId: { in: documentIds } },
			})
		: [];
	const batchIds = [...new Set(proofs.map((proof) => proof.batchId))];
	const batches = batchIds.length
		? await prisma.merkleBatch.findMany({
				where: { id: { in: batchIds } },
			})
		: [];

	const proofByDocumentId = new Map(proofs.map((proof) => [proof.documentId, proof]));
	const batchById = new Map(batches.map((batch) => [batch.id, batch]));

	const rows = records.map((record) => {
		const proof = proofByDocumentId.get(record.id) || null;
		const batch = proof ? batchById.get(proof.batchId) || null : null;
		const documentHash = record.documentHash || record.hash || '';
		const row = {
			id: record.id,
			externalId: record.id,
			recipientName: '[hidden]',
			documentStatus: record.status || 'valid',
			anchorStatus: record.anchorStatus || 'pending',
			anchorPublishStatus: getAnchorStatusFromBatch(record, batch),
			publishMethod: batch?.publishMethod || null,
			batchId: batch?.id || record.anchorBatchId || null,
			batchStatus: batch?.status || null,
			chain: batch?.chain || null,
			transactionId: batch?.transactionId || null,
			anchorCommitmentAvailable: Boolean(batch?.timestampProof),
			merkleRoot: batch?.merkleRoot || null,
			proofAvailable: Boolean(proof),
			documentHash: shortHash(documentHash),
			issuedAt: record.issuedAt || record.createdAt || null,
			updatedAt: record.updatedAt || null,
		};
		row.searchText = lower(
			[
				row.id,
				row.documentStatus,
				row.anchorStatus,
				row.anchorPublishStatus,
				row.batchId,
				row.documentHash,
			].join(' '),
		);
		return row;
	});

	const filteredDocuments = rows.filter((row) => {
		if (search && !row.searchText.includes(search)) return false;
		if (documentStatus !== 'all' && row.documentStatus !== documentStatus) {
			return false;
		}
		if (
			anchorPublishStatus !== 'all' &&
			row.anchorPublishStatus !== anchorPublishStatus &&
			row.anchorStatus !== anchorPublishStatus
		) {
			return false;
		}
		return true;
	});

	return {
		rows,
		filteredDocuments,
	};
}

function summarizeIssuerDocuments(rows) {
	const initial = {
		totalIssued: rows.length,
		valid: 0,
		revoked: 0,
		pendingAnchor: 0,
		timestampPending: 0,
		published: 0,
		failed: 0,
	};

	return rows.reduce((summary, row) => {
		if (row.documentStatus === 'valid') summary.valid += 1;
		if (row.documentStatus === 'revoked') summary.revoked += 1;
		if (row.anchorStatus === 'pending') summary.pendingAnchor += 1;
		if (row.anchorPublishStatus === 'timestamped_pending_confirmation') {
			summary.timestampPending += 1;
		}
		if (row.anchorStatus === 'published' || row.anchorPublishStatus === 'published') {
			summary.published += 1;
		}
		if (row.anchorStatus === 'failed' || row.anchorPublishStatus === 'failed') {
			summary.failed += 1;
		}
		return summary;
	}, initial);
}

function warnLegacyJsonRead(context) {
	console.warn(
		`[document-records] Legacy JSON document record used for ${context} (read-only compatibility).`,
	);
}

function findJsonDocumentRecordById(db, tenantId, documentId) {
	return (db.document_records || []).find(
		(record) => record.id === documentId && record.tenant_id === tenantId,
	);
}

function findJsonDocumentRecordByToken(db, tenantId, token) {
	return (db.document_records || []).find(
		(record) =>
			record.tenant_id === tenantId &&
			(record.verification_token === token || record.qr_token === token),
	);
}

function findJsonDocumentRecordByPublicToken(db, token) {
	return (db.document_records || []).find(
		(record) => record.verification_token === token || record.qr_token === token,
	);
}

function findJsonDocumentRecordByHash(db, tenantId, documentHash) {
	return (db.document_records || []).find(
		(record) =>
			record.tenant_id === tenantId &&
			(record.hash === documentHash || record.document_hash === documentHash),
	);
}

function mapJsonRecordToIssuerRow(db, record) {
	const proof = (db.merkle_proofs || []).find((item) => item.document_id === record.id);
	const batch = proof
		? (db.merkle_batches || []).find((item) => item.id === proof.batch_id)
		: null;
	const documentHash = record.document_hash || record.hash || '';
	const row = {
		id: record.id,
		externalId: record.id,
		recipientName: '[hidden]',
		documentStatus: record.status || 'valid',
		anchorStatus: record.anchor_status || 'pending',
		anchorPublishStatus: getAnchorStatusFromBatch(record, batch),
		publishMethod: batch?.publish_method || null,
		batchId: batch?.id || record.anchor_batch_id || null,
		batchStatus: batch?.status || null,
		chain: batch?.chain || null,
		transactionId: batch?.transaction_id || null,
		anchorCommitmentAvailable: Boolean(batch?.timestamp_proof),
		merkleRoot: batch?.merkle_root || null,
		proofAvailable: Boolean(proof),
		documentHash: shortHash(documentHash),
		issuedAt: record.issued_at || record.created_at || null,
		updatedAt: record.updated_at || null,
	};
	row.searchText = lower(
		[
			row.id,
			row.documentStatus,
			row.anchorStatus,
			row.anchorPublishStatus,
			row.batchId,
			row.documentHash,
		].join(' '),
	);
	return row;
}

function filterIssuerDocumentRows(rows, filters = {}) {
	const search = lower(filters.search);
	const documentStatus = filters.status || 'all';
	const anchorPublishStatus =
		filters.anchorStatus || filters.otsStatus || 'all';

	return rows.filter((row) => {
		if (search && !row.searchText.includes(search)) return false;
		if (documentStatus !== 'all' && row.documentStatus !== documentStatus) {
			return false;
		}
		if (
			anchorPublishStatus !== 'all' &&
			row.anchorPublishStatus !== anchorPublishStatus &&
			row.anchorStatus !== anchorPublishStatus
		) {
			return false;
		}
		return true;
	});
}

async function findDocumentRecordForTenantById({ tenantId, documentId }) {
	const normalizedTenantId = String(tenantId || '').trim();
	const normalizedDocumentId = String(documentId || '').trim();
	if (!normalizedTenantId || !normalizedDocumentId) {
		return null;
	}

	const prismaRecord = await prisma.documentRecord.findFirst({
		where: {
			id: normalizedDocumentId,
			tenantId: normalizedTenantId,
		},
	});

	if (prismaRecord) {
		return {
			source: 'prisma',
			record: prismaRecord,
		};
	}

	const db = await loadDb();
	const jsonRecord = findJsonDocumentRecordById(
		db,
		normalizedTenantId,
		normalizedDocumentId,
	);

	if (jsonRecord) {
		warnLegacyJsonRead('tenant lookup');
		return {
			source: 'json',
			record: jsonRecord,
			db,
		};
	}

	return null;
}

async function findDocumentRecordByHash({ tenantId, documentHash }) {
	const normalizedTenantId = String(tenantId || '').trim();
	const normalizedHash = normalizeDocumentHash(documentHash);

	const prismaRecord =
		(await prisma.documentRecord.findFirst({
			where: {
				tenantId: normalizedTenantId,
				hash: normalizedHash,
			},
		})) ||
		(await prisma.documentRecord.findFirst({
			where: {
				tenantId: normalizedTenantId,
				documentHash: normalizedHash,
			},
		}));

	if (prismaRecord) {
		return {
			source: 'prisma',
			record: prismaRecord,
		};
	}

	const db = await loadDb();
	const jsonRecord = findJsonDocumentRecordByHash(
		db,
		normalizedTenantId,
		normalizedHash,
	);

	if (jsonRecord) {
		warnLegacyJsonRead('hash lookup');
		return {
			source: 'json',
			record: jsonRecord,
			db,
		};
	}

	return null;
}

async function findPublicDocumentRecordByToken(token) {
	const normalizedToken = String(token || '').trim();
	if (!normalizedToken) {
		throw new Error('token is required');
	}

	const prismaRecord =
		(await prisma.documentRecord.findFirst({
			where: { verificationToken: normalizedToken },
		})) ||
		(await prisma.documentRecord.findFirst({
			where: { qrToken: normalizedToken },
		}));

	if (prismaRecord) {
		return {
			source: 'prisma',
			record: prismaRecord,
		};
	}

	const db = await loadDb();
	const jsonRecord = findJsonDocumentRecordByPublicToken(db, normalizedToken);

	if (jsonRecord) {
		warnLegacyJsonRead('public verification');
		return {
			source: 'json',
			record: jsonRecord,
			db,
		};
	}

	return null;
}

function buildPublicBatchPayload(batch) {
	if (!batch) return null;

	return {
		id: batch.id,
		merkle_root: batch.merkleRoot || batch.merkle_root,
		status: batch.status,
		publish_method: batch.publishMethod || batch.publish_method,
		chain: batch.chain,
		transaction_id: batch.transactionId || batch.transaction_id,
		block_number: batch.blockNumber || batch.block_number,
		published_at: batch.publishedAt || batch.published_at,
	};
}

async function verifyPublicDocumentByToken(token) {
	const located = await findPublicDocumentRecordByToken(token);
	if (!located) {
		return { error: 'Verification token not found', status: 404 };
	}

	if (located.source === 'prisma') {
		const record = located.record;
		const { proof, batch } = await findPrismaMerkleContext(record.id);
		const storedHash = record.documentHash || record.hash;

		return {
			status: 200,
			body: {
				token_valid: true,
				document_hash_match: Boolean(storedHash && storedHash === record.hash),
				document_status: record.status,
				anchor_status: record.anchorStatus,
				document_id: record.id,
				external_id: REDACTED,
				recipient_name: REDACTED,
				issued_at: record.issuedAt,
				private_data_redacted: true,
				verification_token: record.verificationToken,
				qr_token: record.qrToken,
				merkle_proof_available: Boolean(proof),
				batch: buildPublicBatchPayload(batch),
			},
		};
	}

	const db = located.db;
	const record = located.record;
	const { proof, batch } = findJsonMerkleContext(db, record);
	const storedHash = record.document_hash || record.hash;

	return {
		status: 200,
		body: {
			token_valid: true,
			document_hash_match: Boolean(storedHash && storedHash === record.hash),
			document_status: record.status || 'valid',
			anchor_status: record.anchor_status || 'pending',
			document_id: record.id,
			external_id: REDACTED,
			recipient_name: REDACTED,
			issued_at: record.issued_at || record.created_at,
			private_data_redacted: true,
			verification_token: record.verification_token,
			qr_token: record.qr_token,
			merkle_proof_available: Boolean(proof),
			batch: buildPublicBatchPayload(batch),
		},
	};
}

async function updateDocumentRecordHash({
	tenantId,
	documentId,
	documentHash,
	auditContext = {},
}) {
	const normalizedHash = normalizeDocumentHash(documentHash);
	const located = await findDocumentRecordForTenantById({ tenantId, documentId });

	if (!located) {
		return { error: 'Document not found', status: 404 };
	}

	const anchorStatus =
		located.record.anchorStatus || located.record.anchor_status || 'pending';
	if (anchorStatus === 'published') {
		return {
			error:
				'Published document hashes cannot be edited. Create a corrected document version instead.',
			status: 409,
		};
	}

	if (located.source === 'prisma') {
		await prisma.$transaction(async (tx) => {
			await tx.documentRecord.update({
				where: { id: documentId },
				data: {
					hash: normalizedHash,
					documentHash: normalizedHash,
					anchorStatus: 'pending',
					anchorBatchId: null,
					updatedAt: new Date(),
				},
			});
			await tx.anchorPool.deleteMany({ where: { documentId } });
			await tx.merkleProof.deleteMany({ where: { documentId } });
			await tx.anchorPool.create({
				data: {
					id: generateRecordId('pool'),
					documentId,
					documentHash: normalizedHash,
					status: 'pending',
				},
			});

			if (auditContext.apiClientId) {
				await tx.apiLog.create({
					data: {
						id: generateRecordId('apilog'),
						tenantId,
						apiClientId: auditContext.apiClientId,
						path: auditContext.path || `/api/issuers/${tenantId}/hashes`,
						method: auditContext.method || 'POST',
						status: 200,
						requestBody: {
							action: 'document_hash_submitted',
							documentId,
						},
						responseBody: { message: 'hash submitted' },
					},
				});
			}
		});

		return {
			status: 200,
			body: { message: 'hash submitted' },
		};
	}

	const db = located.db;
	const record = located.record;
	record.hash = normalizedHash;
	record.document_hash = normalizedHash;
	record.anchor_status = 'pending';
	record.anchor_batch_id = null;
	record.updated_at = now();

	db.anchor_pool = (db.anchor_pool || []).filter(
		(poolRecord) => poolRecord.document_id !== documentId,
	);
	db.merkle_proofs = (db.merkle_proofs || []).filter(
		(proof) => proof.document_id !== documentId,
	);
	db.anchor_pool.push({
		id: generateId('pool'),
		document_id: documentId,
		document_hash: normalizedHash,
		status: 'pending',
		created_at: now(),
		updated_at: now(),
	});

	if (auditContext.apiClientId) {
		db.api_logs = db.api_logs || [];
		db.api_logs.push({
			id: generateId('apilog'),
			tenant_id: tenantId,
			api_client_id: auditContext.apiClientId,
			path: auditContext.path || `/api/issuers/${tenantId}/hashes`,
			method: auditContext.method || 'POST',
			status: 200,
			request_body: {
				action: 'document_hash_submitted',
				documentId,
			},
			response_body: { message: 'hash submitted' },
			created_at: now(),
		});
	}

	await saveDb(db);

	return {
		status: 200,
		body: { message: 'hash submitted' },
	};
}

async function revokeDocumentRecord({
	tenantId,
	documentId,
	reason,
	userId = null,
	issuerId = null,
	auditContext = {},
}) {
	const located = await findDocumentRecordForTenantById({ tenantId, documentId });

	if (!located) {
		return { error: 'Document not found', status: 404 };
	}

	if (located.source === 'prisma') {
		const record = located.record;
		await prisma.documentRecord.update({
			where: { id: documentId },
			data: {
				status: 'revoked',
				updatedAt: new Date(),
			},
		});

		await auditEvent({
			tenantId,
			issuerId: issuerId || record.issuerId,
			userId,
			action: 'document_revoked',
			target: documentId,
			details: redactForLog({ reason: reason || 'manual revocation' }),
		});

		if (auditContext.apiClientId) {
			await prisma.apiLog.create({
				data: {
					id: generateRecordId('apilog'),
					tenantId,
					apiClientId: auditContext.apiClientId,
					path: auditContext.path || `/api/issuers/${tenantId}/revoke`,
					method: auditContext.method || 'POST',
					status: 200,
					requestBody: { action: 'document_revoked', documentId },
					responseBody: { message: 'document revoked' },
				},
			});
		}

		return {
			status: 200,
			body: { message: 'document revoked', status: 'revoked' },
		};
	}

	const db = located.db;
	const record = located.record;
	record.status = 'revoked';
	record.updated_at = now();

	db.audit_logs = db.audit_logs || [];
	db.audit_logs.push({
		id: generateId('audit'),
		tenant_id: tenantId,
		issuer_id: issuerId || record.issuer_id || tenantId,
		user_id: userId,
		action: 'document_revoked',
		target: documentId,
		details: redactForLog({ reason: reason || 'manual revocation' }),
		created_at: now(),
	});

	if (auditContext.apiClientId) {
		db.api_logs = db.api_logs || [];
		db.api_logs.push({
			id: generateId('apilog'),
			tenant_id: tenantId,
			api_client_id: auditContext.apiClientId,
			path: auditContext.path || `/api/issuers/${tenantId}/revoke`,
			method: auditContext.method || 'POST',
			status: 200,
			request_body: { action: 'document_revoked', documentId },
			response_body: { message: 'document revoked' },
			created_at: now(),
		});
	}

	await saveDb(db);

	return {
		status: 200,
		body: { message: 'document revoked', status: 'revoked' },
	};
}

async function rotateDocumentQrToken({ tenantId, documentId, auditContext = {} }) {
	const located = await findDocumentRecordForTenantById({ tenantId, documentId });

	if (!located) {
		return { error: 'Document not found', status: 404 };
	}

	const qrToken = generateRecordId('qr');

	if (located.source === 'prisma') {
		await prisma.documentRecord.update({
			where: { id: documentId },
			data: {
				qrToken,
				updatedAt: new Date(),
			},
		});

		if (auditContext.apiClientId) {
			await prisma.apiLog.create({
				data: {
					id: generateRecordId('apilog'),
					tenantId,
					apiClientId: auditContext.apiClientId,
					path: auditContext.path || `/api/issuers/${tenantId}/qr`,
					method: auditContext.method || 'POST',
					status: 200,
					requestBody: { action: 'document_qr_rotated', documentId },
					responseBody: { message: 'qr rotated' },
				},
			});
		}

		return {
			status: 200,
			body: {
				qrToken,
				qrUrl: `/api/issuers/${tenantId}/verify?token=${qrToken}`,
			},
		};
	}

	const db = located.db;
	const record = located.record;
	record.qr_token = qrToken;
	record.updated_at = now();

	if (auditContext.apiClientId) {
		db.api_logs = db.api_logs || [];
		db.api_logs.push({
			id: generateId('apilog'),
			tenant_id: tenantId,
			api_client_id: auditContext.apiClientId,
			path: auditContext.path || `/api/issuers/${tenantId}/qr`,
			method: auditContext.method || 'POST',
			status: 200,
			request_body: { action: 'document_qr_rotated', documentId },
			response_body: { message: 'qr rotated' },
			created_at: now(),
		});
	}

	await saveDb(db);

	return {
		status: 200,
		body: {
			qrToken,
			qrUrl: `/api/issuers/${tenantId}/verify?token=${qrToken}`,
		},
	};
}

async function listMergedIssuerDocumentRecords(tenantId, filters = {}) {
	const prismaResult = await listIssuerDocumentRecords(tenantId, filters);
	const prismaIds = new Set(prismaResult.rows.map((row) => row.id));
	const db = await loadDb();
	const legacyRows = (db.document_records || [])
		.filter((record) => record.tenant_id === tenantId && !prismaIds.has(record.id))
		.map((record) => mapJsonRecordToIssuerRow(db, record))
		.sort((a, b) => new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0));

	const rows = [...prismaResult.rows, ...legacyRows].sort(
		(a, b) => new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0),
	);
	const filteredDocuments = filterIssuerDocumentRows(rows, filters);

	return {
		rows,
		filteredDocuments,
	};
}

async function countPlatformDocumentRecords(db) {
	const prismaRecords = await prisma.documentRecord.findMany({
		select: { id: true, anchorStatus: true },
	});
	const prismaIds = new Set(prismaRecords.map((record) => record.id));
	const legacyRecords = (db.document_records || []).filter(
		(record) => !prismaIds.has(record.id),
	);

	return {
		total: prismaRecords.length + legacyRecords.length,
		anchored:
			prismaRecords.filter((record) => record.anchorStatus === 'published').length +
			legacyRecords.filter((record) => record.anchor_status === 'published').length,
	};
}

async function countPlatformAnchorPool(db) {
	const prismaPool = await prisma.anchorPool.findMany({
		select: { id: true, documentId: true, status: true },
	});
	const prismaDocumentIds = new Set(prismaPool.map((entry) => entry.documentId));
	const legacyPool = (db.anchor_pool || []).filter(
		(entry) => !prismaDocumentIds.has(entry.document_id),
	);

	const merged = [
		...prismaPool.map((entry) => ({ status: entry.status })),
		...legacyPool.map((entry) => ({ status: entry.status })),
	];

	return {
		pending: merged.filter((entry) => entry.status === 'pending').length,
		batched: merged.filter((entry) => entry.status === 'batched').length,
		anchored: merged.filter((entry) => entry.status === 'anchored').length,
		failed: merged.filter((entry) => entry.status === 'failed').length,
	};
}

export {
	countPlatformAnchorPool,
	countPlatformDocumentRecords,
	createDocumentRecord,
	createDocumentRecordWithClient,
	findDocumentRecordByHash,
	findDocumentRecordByVerificationToken,
	findDocumentRecordForTenantById,
	findJsonDocumentRecordByHash,
	findJsonDocumentRecordById,
	findJsonDocumentRecordByToken,
	findPublicDocumentRecordByToken,
	getDocumentRecordById,
	listIssuerDocumentRecords,
	listMergedIssuerDocumentRecords,
	revokeDocumentRecord,
	rotateDocumentQrToken,
	summarizeIssuerDocuments,
	updateDocumentRecordHash,
	verifyPublicDocumentByToken,
	verifyTenantDocumentRecord,
};
