import { generateId, now } from '@/lib/db';
import {
	buildMerkleTree,
	documentLeafHash,
	proofForLeaf,
	verifyMerkleProof,
} from '@/lib/anchoring/merkle';
import { createPublisher, verifyAnchorCommitment } from '@/lib/anchoring/publishers';
import { prisma } from '@/lib/prisma';

function batchField(batch, camelKey, snakeKey) {
	if (!batch) return null;
	return batch[camelKey] ?? batch[snakeKey] ?? null;
}

function normalizeBatchErrorMessage(error) {
	const message =
		error instanceof Error ? error.message : String(error || 'Publishing failed');
	return message.trim().slice(0, 500) || 'Publishing failed';
}

let fairBatchQueueCursor = 'json';

function resetFairBatchQueueForTests(cursor = 'json') {
	fairBatchQueueCursor = cursor;
}

function pendingPoolRecords(
	db,
	limit = Number(process.env.ANCHOR_BATCH_SIZE || 100),
	excludeDocumentIds = new Set(),
) {
	return [...(db.anchor_pool || [])]
		.filter(
			(record) =>
				record.status === 'pending' &&
				!excludeDocumentIds.has(record.document_id),
		)
		.sort((a, b) => {
			const created = new Date(a.created_at) - new Date(b.created_at);
			return created || String(a.id).localeCompare(String(b.id));
		})
		.slice(0, limit);
}

function resolvePublishMethod(method) {
	const publishMethod = method || process.env.ANCHOR_PUBLISH_METHOD || 'audit_anchor';
	const normalized =
		publishMethod === 'mock' || publishMethod === 'opentimestamps'
			? 'audit_anchor'
			: publishMethod;
	if (process.env.NODE_ENV === 'production' && normalized === 'mock') {
		throw new Error('ANCHOR_PUBLISH_METHOD must not be mock in production');
	}
	return normalized;
}

function createMerkleBatch(db, options = {}) {
	const pending = pendingPoolRecords(
		db,
		options.limit,
		options.excludeDocumentIds || new Set(),
	);
	if (pending.length === 0) return null;

	const leaves = pending.map((record, index) => ({
		anchorPoolId: record.id,
		documentId: record.document_id,
		documentHash: record.document_hash,
		leafHash: documentLeafHash(record.document_hash, record.document_id),
		proofIndex: index,
	}));
	const { merkleRoot, levels } = buildMerkleTree(leaves);
	const batchId = generateId('batch');
	const timestamp = now();

	db.merkle_batches.push({
		id: batchId,
		merkle_root: merkleRoot,
		batch_size: leaves.length,
		status: 'created',
		publish_method: resolvePublishMethod(options.publishMethod),
		chain: null,
		transaction_id: null,
		block_number: null,
		timestamp_proof: null,
		published_at: null,
		created_at: timestamp,
		updated_at: timestamp,
	});

	for (const leaf of leaves) {
		db.merkle_proofs.push({
			id: generateId('proof'),
			document_id: leaf.documentId,
			batch_id: batchId,
			leaf_hash: leaf.leafHash,
			proof_path: proofForLeaf(levels, leaf.proofIndex),
			proof_index: leaf.proofIndex,
			created_at: timestamp,
		});

		const poolRecord = db.anchor_pool.find((record) => record.id === leaf.anchorPoolId);
		if (poolRecord) {
			poolRecord.status = 'batched';
			poolRecord.updated_at = timestamp;
		}

		const document = db.document_records.find((record) => record.id === leaf.documentId);
		if (document) {
			document.anchor_status = 'batched';
			document.anchor_batch_id = batchId;
			document.updated_at = timestamp;
		}
	}

	return db.merkle_batches.find((batch) => batch.id === batchId);
}

function markBatchDocumentsPublished(db, batch, timestamp = now()) {
	for (const proof of db.merkle_proofs.filter((item) => item.batch_id === batch.id)) {
		const document = db.document_records.find((record) => record.id === proof.document_id);
		if (document) {
			document.anchor_status = 'published';
			document.anchor_batch_id = batch.id;
			document.updated_at = timestamp;
		}
		const poolRecord = db.anchor_pool.find(
			(record) => record.document_id === proof.document_id,
		);
		if (poolRecord) {
			poolRecord.status = 'anchored';
			poolRecord.updated_at = timestamp;
		}
	}
}

function applyPublishResult(db, batch, result) {
	const timestamp = now();
	batch.publish_method = result.publishMethod;
	batch.chain = result.chain || null;
	batch.transaction_id = result.transactionId || null;
	batch.block_number = result.blockNumber || null;
	batch.timestamp_proof = result.timestampProof || null;
	batch.published_at = result.publishedAt || null;
	batch.status = result.status || 'failed';
	batch.updated_at = timestamp;

	if (batch.status === 'published') {
		batch.published_at = batch.published_at || timestamp;
		markBatchDocumentsPublished(db, batch, timestamp);
	}

	return batch;
}

async function publishMerkleBatch(db, batchId, options = {}) {
	const batch = db.merkle_batches.find((record) => record.id === batchId);
	if (!batch) throw new Error('Merkle batch not found');
	if (batch.status === 'published' && !options.force) return batch;

	batch.status = 'publishing';
	batch.updated_at = now();

	try {
		const publisher =
			options.publisher ||
			createPublisher(resolvePublishMethod(options.publishMethod || batch.publish_method));
		const result = await publisher.publishMerkleRoot({
			batchId: batch.id,
			merkleRoot: batch.merkle_root,
			batchSize: batch.batch_size,
		});
		return applyPublishResult(db, batch, result);
	} catch (error) {
		batch.status = 'failed';
		batch.updated_at = now();
		batch.error_message = error instanceof Error ? error.message : 'Publishing failed';
		for (const proof of db.merkle_proofs.filter((item) => item.batch_id === batch.id)) {
			const document = db.document_records.find((record) => record.id === proof.document_id);
			if (document) {
				document.anchor_status = 'failed';
				document.updated_at = now();
			}
			const poolRecord = db.anchor_pool.find((record) => record.document_id === proof.document_id);
			if (poolRecord) {
				poolRecord.status = 'failed';
				poolRecord.updated_at = now();
			}
		}
		throw error;
	}
}

function verifyBatchPublicCommitment(batch) {
	const publishMethod = batchField(batch, 'publishMethod', 'publish_method');
	const transactionId = batchField(batch, 'transactionId', 'transaction_id');
	const blockNumber = batchField(batch, 'blockNumber', 'block_number');
	const timestampProof = batchField(batch, 'timestampProof', 'timestamp_proof');
	const merkleRoot = batchField(batch, 'merkleRoot', 'merkle_root');
	const publishedAtValue = batchField(batch, 'publishedAt', 'published_at');

	if (!batch || batch.status !== 'published') {
		return { verified: false, method: publishMethod };
	}

	if (transactionId && batch.chain && blockNumber) {
		return {
			verified: true,
			method: publishMethod,
			chain: batch.chain,
			blockNumber,
			publishedAt: publishedAtValue || null,
		};
	}

	if (timestampProof) {
		const anchorVerification = verifyAnchorCommitment({
			merkleRoot,
			timestampProof,
		});
		if (anchorVerification.verified) {
			return {
				verified: true,
				method: publishMethod,
				chain: anchorVerification.chain,
				blockNumber: anchorVerification.blockNumber,
				publishedAt: anchorVerification.publishedAt,
				legacy: publishMethod === 'opentimestamps',
			};
		}
	}

	// Legacy OpenTimestamps batches remain verifiable via Merkle proof + published status
	// even though Bitcoin timestamp re-verification is no longer performed.
	if (publishMethod === 'opentimestamps') {
		return {
			verified: true,
			method: 'opentimestamps_legacy',
			chain: batch.chain || 'bitcoin_timestamp_legacy',
			blockNumber,
			publishedAt: publishedAtValue || null,
			legacy: true,
		};
	}

	return {
		verified: Boolean(timestampProof || transactionId),
		method: publishMethod,
		chain: batch.chain,
		blockNumber,
		publishedAt: publishedAtValue || null,
	};
}

async function isPrismaDocumentEligibleForBatching(documentId) {
	const record = await prisma.documentRecord.findFirst({
		where: { id: documentId },
		select: { anchorStatus: true },
	});
	if (record?.anchorStatus === 'published') return false;

	const anchoredPool = await prisma.anchorPool.findFirst({
		where: {
			documentId,
			status: 'anchored',
		},
	});
	if (anchoredPool) return false;

	const latestProof = await prisma.merkleProof.findFirst({
		where: { documentId },
		orderBy: { createdAt: 'desc' },
		select: { batchId: true },
	});
	if (!latestProof) return true;

	const latestBatch = await prisma.merkleBatch.findFirst({
		where: { id: latestProof.batchId },
		select: { status: true },
	});
	return latestBatch?.status !== 'published';
}

async function pendingPrismaPoolRecords(
	limit = Number(process.env.ANCHOR_BATCH_SIZE || 100),
) {
	const pending = await prisma.anchorPool.findMany({
		where: { status: 'pending' },
		orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
	});

	const eligible = [];
	for (const record of pending) {
		if (!(await isPrismaDocumentEligibleForBatching(record.documentId))) continue;
		eligible.push(record);
		if (eligible.length >= limit) break;
	}

	return eligible;
}

async function prismaAnchoredDocumentIds() {
	const records = await prisma.documentRecord.findMany({
		where: { anchorStatus: 'published' },
		select: { id: true },
	});
	return new Set(records.map((record) => record.id));
}

async function resolveFairBatchSource(db, options = {}) {
	if (options.batchSource === 'prisma' || options.batchSource === 'json') {
		return options.batchSource;
	}

	const probeLimit = 1;
	const prismaPending = await pendingPrismaPoolRecords(probeLimit);
	const excludeDocumentIds = await prismaAnchoredDocumentIds();
	const jsonPending = pendingPoolRecords(db, probeLimit, excludeDocumentIds);
	const hasPrisma = prismaPending.length > 0;
	const hasJson = jsonPending.length > 0;

	if (!hasPrisma && !hasJson) return null;
	if (hasPrisma && !hasJson) return 'prisma';
	if (hasJson && !hasPrisma) return 'json';

	fairBatchQueueCursor = fairBatchQueueCursor === 'prisma' ? 'json' : 'prisma';
	return fairBatchQueueCursor;
}

async function createPrismaMerkleBatch(options = {}) {
	const limit = Number(options.limit || process.env.ANCHOR_BATCH_SIZE || 100);
	const pending = await pendingPrismaPoolRecords(limit);
	if (pending.length === 0) return null;

	for (const record of pending) {
		if (!(await isPrismaDocumentEligibleForBatching(record.documentId))) {
			throw new Error('Attempted to batch an already anchored document');
		}
	}

	const leaves = pending.map((record, index) => ({
		anchorPoolId: record.id,
		documentId: record.documentId,
		documentHash: record.documentHash,
		leafHash: documentLeafHash(record.documentHash, record.documentId),
		proofIndex: index,
	}));
	const { merkleRoot, levels } = buildMerkleTree(leaves);
	const batchId = generateId('batch');
	const timestamp = new Date();

	return prisma.$transaction(async (tx) => {
		const createdBatch = await tx.merkleBatch.create({
			data: {
				id: batchId,
				merkleRoot,
				batchSize: leaves.length,
				status: 'created',
				publishMethod: resolvePublishMethod(options.publishMethod),
			},
		});

		for (const leaf of leaves) {
			await tx.merkleProof.create({
				data: {
					id: generateId('proof'),
					documentId: leaf.documentId,
					batchId,
					leafHash: leaf.leafHash,
					proofPath: proofForLeaf(levels, leaf.proofIndex),
					proofIndex: leaf.proofIndex,
				},
			});
			await tx.anchorPool.update({
				where: { id: leaf.anchorPoolId },
				data: {
					status: 'batched',
					updatedAt: timestamp,
				},
			});
			await tx.documentRecord.update({
				where: { id: leaf.documentId },
				data: {
					anchorStatus: 'batched',
					anchorBatchId: batchId,
					updatedAt: timestamp,
				},
			});
		}

		return createdBatch;
	});
}

async function markPrismaBatchDocumentsPublished(tx, batchId, timestamp = new Date()) {
	const proofs = await tx.merkleProof.findMany({
		where: { batchId },
	});

	for (const proof of proofs) {
		await tx.documentRecord.update({
			where: { id: proof.documentId },
			data: {
				anchorStatus: 'published',
				anchorBatchId: batchId,
				updatedAt: timestamp,
			},
		});
		await tx.anchorPool.updateMany({
			where: { documentId: proof.documentId },
			data: {
				status: 'anchored',
				updatedAt: timestamp,
			},
		});
	}
}

async function markPrismaBatchDocumentsFailed(tx, batchId, timestamp = new Date()) {
	const proofs = await tx.merkleProof.findMany({
		where: { batchId },
	});

	for (const proof of proofs) {
		await tx.documentRecord.update({
			where: { id: proof.documentId },
			data: {
				anchorStatus: 'failed',
				updatedAt: timestamp,
			},
		});
		await tx.anchorPool.updateMany({
			where: { documentId: proof.documentId },
			data: {
				status: 'failed',
				updatedAt: timestamp,
			},
		});
	}
}

async function publishPrismaMerkleBatch(batchId, options = {}) {
	const batch = await prisma.merkleBatch.findFirst({
		where: { id: batchId },
	});
	if (!batch) throw new Error('Merkle batch not found');
	if (batch.status === 'published' && !options.force) return batch;

	await prisma.merkleBatch.update({
		where: { id: batchId },
		data: {
			status: 'publishing',
			errorMessage: null,
			updatedAt: new Date(),
		},
	});

	try {
		const publisher =
			options.publisher ||
			createPublisher(resolvePublishMethod(options.publishMethod || batch.publishMethod));
		const result = await publisher.publishMerkleRoot({
			batchId: batch.id,
			merkleRoot: batch.merkleRoot,
			batchSize: batch.batchSize,
		});
		const timestamp = new Date();

		await prisma.$transaction(async (tx) => {
			await tx.merkleBatch.update({
				where: { id: batchId },
				data: {
					publishMethod: result.publishMethod,
					chain: result.chain || null,
					transactionId: result.transactionId || null,
					blockNumber: result.blockNumber || null,
					timestampProof: result.timestampProof || null,
					publishedAt: result.publishedAt ? new Date(result.publishedAt) : null,
					status: result.status || 'failed',
					errorMessage:
						result.status === 'published'
							? null
							: normalizeBatchErrorMessage('Publishing failed'),
					updatedAt: timestamp,
				},
			});

			if (result.status === 'published') {
				await tx.merkleBatch.update({
					where: { id: batchId },
					data: {
						publishedAt: result.publishedAt
							? new Date(result.publishedAt)
							: timestamp,
					},
				});
				await markPrismaBatchDocumentsPublished(tx, batchId, timestamp);
			}
		});

		return prisma.merkleBatch.findFirst({
			where: { id: batchId },
		});
	} catch (error) {
		const timestamp = new Date();
		const errorMessage = normalizeBatchErrorMessage(error);
		await prisma.$transaction(async (tx) => {
			await tx.merkleBatch.update({
				where: { id: batchId },
				data: {
					status: 'failed',
					errorMessage,
					updatedAt: timestamp,
				},
			});
			await markPrismaBatchDocumentsFailed(tx, batchId, timestamp);
		});
		throw error;
	}
}

async function preparePrismaBatchForRetry(batchId) {
	const batch = await prisma.merkleBatch.findFirst({
		where: { id: batchId },
	});
	if (!batch) throw new Error('Merkle batch not found');
	if (batch.status === 'published') return batch;

	const proofs = await prisma.merkleProof.findMany({
		where: { batchId },
	});
	if (proofs.length === 0) {
		throw new Error('Cannot retry batch without existing Merkle proofs');
	}

	const timestamp = new Date();
	await prisma.$transaction(async (tx) => {
		await tx.merkleBatch.update({
			where: { id: batchId },
			data: {
				status: 'created',
				errorMessage: null,
				updatedAt: timestamp,
			},
		});

		for (const proof of proofs) {
			const record = await tx.documentRecord.findFirst({
				where: { id: proof.documentId },
				select: { anchorStatus: true },
			});
			if (record?.anchorStatus === 'published') continue;

			await tx.documentRecord.update({
				where: { id: proof.documentId },
				data: {
					anchorStatus: 'batched',
					anchorBatchId: batchId,
					updatedAt: timestamp,
				},
			});
			await tx.anchorPool.updateMany({
				where: { documentId: proof.documentId },
				data: {
					status: 'batched',
					updatedAt: timestamp,
				},
			});
		}
	});

	return prisma.merkleBatch.findFirst({
		where: { id: batchId },
	});
}

async function createAndPublishPrismaMerkleBatch(options = {}) {
	const batch = await createPrismaMerkleBatch(options);
	if (!batch) return null;
	return publishPrismaMerkleBatch(batch.id, options);
}

async function createAndPublishMerkleBatch(db, options = {}) {
	const source = await resolveFairBatchSource(db, options);
	if (!source) return null;

	if (source === 'prisma') {
		return createAndPublishPrismaMerkleBatch(options);
	}

	const excludeDocumentIds = await prismaAnchoredDocumentIds();
	const batch = createMerkleBatch(db, {
		...options,
		excludeDocumentIds,
	});
	if (!batch) return null;
	return publishMerkleBatch(db, batch.id, options);
}

function verifyDocumentMerkleProof(db, document) {
	const proof = (db.merkle_proofs || []).find((item) => item.document_id === document.id);
	if (!proof) return { proof: null, batch: null, valid: false };
	const batch = (db.merkle_batches || []).find((item) => item.id === proof.batch_id);
	if (!batch) return { proof, batch: null, valid: false };

	const leafHash = documentLeafHash(
		document.document_hash || document.hash || document.documentHash,
		document.id,
	);
	const valid =
		leafHash === proof.leaf_hash &&
		verifyMerkleProof({
			leafHash,
			proofPath: proof.proof_path,
			merkleRoot: batch.merkle_root,
		});

	return { proof, batch, valid, leafHash };
}

async function verifyPrismaDocumentMerkleProof(document) {
	const proof = await prisma.merkleProof.findFirst({
		where: { documentId: document.id },
		orderBy: { createdAt: 'desc' },
	});
	if (!proof) return { proof: null, batch: null, valid: false, leafHash: null };

	const batch = await prisma.merkleBatch.findFirst({
		where: { id: proof.batchId },
	});
	if (!batch) return { proof, batch: null, valid: false, leafHash: null };

	const leafHash = documentLeafHash(
		document.documentHash || document.document_hash || document.hash,
		document.id,
	);
	const valid =
		leafHash === proof.leafHash &&
		verifyMerkleProof({
			leafHash,
			proofPath: proof.proofPath,
			merkleRoot: batch.merkleRoot,
		});

	return { proof, batch, valid, leafHash };
}

function summarizeBatchRecord(batch, validProofCount = 0) {
	return {
		id: batch.id,
		merkleRoot: batchField(batch, 'merkleRoot', 'merkle_root'),
		batchSize: batchField(batch, 'batchSize', 'batch_size'),
		status: batch.status,
		publishMethod: batchField(batch, 'publishMethod', 'publish_method'),
		chain: batch.chain,
		transactionId: batchField(batch, 'transactionId', 'transaction_id'),
		blockNumber: batchField(batch, 'blockNumber', 'block_number'),
		anchorCommitmentAvailable: Boolean(
			batchField(batch, 'timestampProof', 'timestamp_proof'),
		),
		publishedAt: batchField(batch, 'publishedAt', 'published_at'),
		createdAt: batchField(batch, 'createdAt', 'created_at'),
		updatedAt: batchField(batch, 'updatedAt', 'updated_at'),
		errorMessage: batch.error_message || batch.errorMessage || null,
		validProofCount,
	};
}

function batchSummary(db, batch) {
	const proofs = (db.merkle_proofs || []).filter((proof) => proof.batch_id === batch.id);
	const validProofCount = proofs.filter((proof) => {
		const document = db.document_records.find((record) => record.id === proof.document_id);
		return document && verifyDocumentMerkleProof(db, document).valid;
	}).length;

	return summarizeBatchRecord(batch, validProofCount);
}

async function summarizePrismaBatch(batch) {
	const proofs = await prisma.merkleProof.findMany({
		where: { batchId: batch.id },
	});
	let validProofCount = 0;

	for (const proof of proofs) {
		const document = await prisma.documentRecord.findFirst({
			where: { id: proof.documentId },
			select: { id: true, hash: true, documentHash: true },
		});
		if (!document) continue;
		const result = await verifyPrismaDocumentMerkleProof(document);
		if (result.valid) validProofCount += 1;
	}

	return summarizeBatchRecord(batch, validProofCount);
}

async function findMerkleBatchById(batchId, db) {
	const prismaBatch = await prisma.merkleBatch.findFirst({
		where: { id: batchId },
	});
	if (prismaBatch) {
		return { source: 'prisma', batch: prismaBatch };
	}

	const jsonBatch = (db?.merkle_batches || []).find((record) => record.id === batchId);
	if (jsonBatch) {
		return { source: 'json', batch: jsonBatch, db };
	}

	return null;
}

async function verifyMerkleBatchProofs(batchId, db) {
	const located = await findMerkleBatchById(batchId, db);
	if (!located) {
		return { error: 'Merkle batch not found', status: 404 };
	}

	if (located.source === 'prisma') {
		const proofs = await prisma.merkleProof.findMany({
			where: { batchId },
		});
		const proofResults = [];

		for (const proof of proofs) {
			const document = await prisma.documentRecord.findFirst({
				where: { id: proof.documentId },
				select: { id: true, hash: true, documentHash: true },
			});
			const result = document
				? await verifyPrismaDocumentMerkleProof(document)
				: { valid: false, leafHash: null };
			proofResults.push({
				documentId: proof.documentId,
				leafHash: proof.leafHash,
				recomputedLeafHash: result.leafHash || null,
				valid: Boolean(result.valid),
			});
		}

		const anchorVerification = verifyBatchPublicCommitment(located.batch);
		const publicCommitmentValid = Boolean(
			proofResults.every((result) => result.valid) && anchorVerification.verified,
		);

		return {
			status: 200,
			body: {
				batchId: located.batch.id,
				merkleRoot: located.batch.merkleRoot,
				status: located.batch.status,
				proofCount: proofResults.length,
				validProofCount: proofResults.filter((result) => result.valid).length,
				merkleProofsValid: proofResults.every((result) => result.valid),
				publicCommitmentValid,
				anchorVerification,
				proofResults,
			},
		};
	}

	const batch = located.batch;
	const proofs = (located.db.merkle_proofs || []).filter((proof) => proof.batch_id === batchId);
	const proofResults = proofs.map((proof) => {
		const document = located.db.document_records.find(
			(record) => record.id === proof.document_id,
		);
		const result = document
			? verifyDocumentMerkleProof(located.db, document)
			: { valid: false, leafHash: null };
		return {
			documentId: proof.document_id,
			leafHash: proof.leaf_hash,
			recomputedLeafHash: result.leafHash || null,
			valid: Boolean(result.valid),
		};
	});
	const anchorVerification = verifyBatchPublicCommitment(batch);
	const publicCommitmentValid = Boolean(
		proofResults.every((result) => result.valid) && anchorVerification.verified,
	);

	return {
		status: 200,
		body: {
			batchId: batch.id,
			merkleRoot: batch.merkle_root,
			status: batch.status,
			proofCount: proofResults.length,
			validProofCount: proofResults.filter((result) => result.valid).length,
			merkleProofsValid: proofResults.every((result) => result.valid),
			publicCommitmentValid,
			anchorVerification,
			proofResults,
		},
	};
}

async function getAdminAnchoringSummary(db) {
	const prismaPool = await prisma.anchorPool.findMany({
		select: { id: true, documentId: true, status: true },
	});
	const prismaDocumentIds = new Set(prismaPool.map((entry) => entry.documentId));
	const legacyPool = (db.anchor_pool || []).filter(
		(entry) => !prismaDocumentIds.has(entry.document_id),
	);
	const mergedPool = [
		...prismaPool.map((entry) => ({ status: entry.status })),
		...legacyPool.map((entry) => ({ status: entry.status })),
	];

	const prismaBatches = await prisma.merkleBatch.findMany({
		orderBy: { createdAt: 'desc' },
		take: 20,
	});
	const prismaBatchIds = new Set(prismaBatches.map((batch) => batch.id));
	const legacyBatches = [...(db.merkle_batches || [])]
		.filter((batch) => !prismaBatchIds.has(batch.id))
		.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

	const prismaSummaries = await Promise.all(
		prismaBatches.map((batch) => summarizePrismaBatch(batch)),
	);
	const legacySummaries = legacyBatches
		.slice(0, Math.max(0, 20 - prismaSummaries.length))
		.map((batch) => batchSummary(db, batch));
	const latestBatches = [...prismaSummaries, ...legacySummaries]
		.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
		.slice(0, 20);

	return {
		pendingAnchorCount: mergedPool.filter((entry) => entry.status === 'pending').length,
		batchedAnchorCount: mergedPool.filter((entry) => entry.status === 'batched').length,
		anchoredCount: mergedPool.filter((entry) => entry.status === 'anchored').length,
		failedAnchorCount: mergedPool.filter((entry) => entry.status === 'failed').length,
		latestBatches,
	};
}

async function retryMerkleBatchPublish(batchId, db, options = {}) {
	const located = await findMerkleBatchById(batchId, db);
	if (!located) throw new Error('Merkle batch not found');

	if (located.source === 'prisma') {
		if (located.batch.status === 'published' && !options.force) {
			return located.batch;
		}
		const proofCountBefore = await prisma.merkleProof.count({
			where: { batchId },
		});
		await preparePrismaBatchForRetry(batchId);
		const published = await publishPrismaMerkleBatch(batchId, options);
		const proofCountAfter = await prisma.merkleProof.count({
			where: { batchId },
		});
		if (proofCountAfter !== proofCountBefore) {
			throw new Error('Retry must not duplicate Merkle proofs');
		}
		return published;
	}

	return publishMerkleBatch(db, batchId, options);
}

export {
	batchSummary,
	createAndPublishMerkleBatch,
	createAndPublishPrismaMerkleBatch,
	createMerkleBatch,
	createPrismaMerkleBatch,
	getAdminAnchoringSummary,
	isPrismaDocumentEligibleForBatching,
	publishMerkleBatch,
	publishPrismaMerkleBatch,
	preparePrismaBatchForRetry,
	resetFairBatchQueueForTests,
	resolveFairBatchSource,
	retryMerkleBatchPublish,
	verifyBatchPublicCommitment,
	verifyDocumentMerkleProof,
	verifyMerkleBatchProofs,
	verifyPrismaDocumentMerkleProof,
};
