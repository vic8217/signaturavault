import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

async function loadDb() {
	try {
		const text = await fs.readFile(DB_PATH, 'utf8');
		return JSON.parse(text);
	} catch (error) {
		if (error.code === 'ENOENT') {
			const initial = {
				tenants: [],
				issuers: [],
				issuer_users: [],
				issuer_api_clients: [],
				issuer_api_keys: [],
				document_types: [],
				document_templates: [],
				document_records: [],
				verification_tokens: [],
				storage_connections: [],
				blockchain_anchors: [],
				webhooks: [],
				api_logs: [],
				audit_logs: [],
			};
			await saveDb(initial);
			return initial;
		}
		throw error;
	}
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
	const db = await loadDb();
	const result = await operation(db);
	await saveDb(db);
	return result;
}

export { loadDb, saveDb, withDb, generateId, now };
