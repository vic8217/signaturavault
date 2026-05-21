import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');
let writeQueue = Promise.resolve();

async function loadDb() {
	try {
		const text = await fs.readFile(DB_PATH, 'utf8');
		return normalizeDb(JSON.parse(text));
	} catch (error) {
		if (error.code === 'ENOENT') {
			const initial = normalizeDb({});
			await saveDb(initial);
			return initial;
		}
		throw error;
	}
}

function normalizeDb(data) {
	const normalized = data || {};
	for (const key of [
		'tenants',
		'issuers',
		'issuer_users',
		'issuer_api_clients',
		'issuer_api_keys',
		'document_types',
		'document_templates',
		'document_records',
		'verification_tokens',
		'storage_connections',
		'blockchain_anchors',
		'anchor_pool',
		'merkle_batches',
		'merkle_proofs',
		'webhooks',
		'api_logs',
		'audit_logs',
	]) {
		if (!Array.isArray(normalized[key])) normalized[key] = [];
	}
	for (const record of normalized.document_records) {
		if (!record.document_hash) record.document_hash = record.hash;
		if (record.status === 'issued') record.status = 'valid';
		if (!record.anchor_status) record.anchor_status = 'pending';
		if (!Object.hasOwn(record, 'anchor_batch_id')) record.anchor_batch_id = null;
	}
	for (const record of normalized.document_records) {
		const hasPoolRecord = normalized.anchor_pool.some(
			(poolRecord) => poolRecord.document_id === record.id,
		);
		const hasProof = normalized.merkle_proofs.some(
			(proof) => proof.document_id === record.id,
		);
		if (!hasPoolRecord && !hasProof && record.document_hash) {
			normalized.anchor_pool.push({
				id: generateId('pool'),
				document_id: record.id,
				document_hash: record.document_hash,
				status: record.anchor_status === 'failed' ? 'failed' : 'pending',
				created_at: record.created_at || now(),
				updated_at: now(),
			});
		}
	}
	return normalized;
}

async function saveDb(data) {
	await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
	await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function generateId(prefix = 'id') {
	const random = crypto.randomBytes(8).toString('hex');
	return `${prefix}_${random}`;
}

function now() {
	return new Date().toISOString();
}

async function withDb(operation) {
	const runOperation = writeQueue.then(async () => {
		const db = await loadDb();
		const result = await operation(db);
		await saveDb(db);
		return result;
	});

	writeQueue = runOperation.catch(() => {});
	return runOperation;
}

export { loadDb, saveDb, withDb, generateId, now };
