import crypto from 'crypto';
import { generateId, now } from '@/lib/db';
import { prisma } from '@/lib/prisma';

const CODE_PREFIX = 'ISSR';

function normalizeCode(value) {
	return String(value || '').trim().toUpperCase();
}

function generateIssuerAuthorizationCode() {
	const random = crypto.randomBytes(6).toString('hex').toUpperCase();
	return `${CODE_PREFIX}-${random.slice(0, 4)}-${random.slice(4, 8)}`;
}

function hashAuthorizationCode(value) {
	return crypto
		.createHash('sha256')
		.update(normalizeCode(value))
		.digest('hex');
}

async function createIssuerAuthorizationCode({
	label = 'Issuer Signatura ID',
	issuerId = '',
	tenantId = '',
	db: dbOverride,
} = {}) {
	const code = generateIssuerAuthorizationCode();
	const codeHash = hashAuthorizationCode(code);
	const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

	if (!dbOverride) {
		await prisma.issuerAuthorizationCode.create({
			data: {
				id: generateId('authcode'),
				issuerId: issuerId || null,
				tenantId: tenantId || null,
				codeHash,
				label,
				expiresAt: new Date(expiresAt),
				status: 'active',
				usedAt: null,
			},
		});

		return {
			code,
			expiresAt,
			label,
			issuerId: issuerId || null,
			tenantId: tenantId || null,
		};
	}

	const db = dbOverride;
	const records = Array.isArray(db.issuer_authorization_codes)
		? db.issuer_authorization_codes
		: [];

	records.push({
		id: generateId('authcode'),
		issuerId: issuerId || null,
		tenantId: tenantId || null,
		codeHash,
		label,
		createdAt: now(),
		expiresAt,
		status: 'active',
		usedAt: null,
	});

	db.issuer_authorization_codes = records;

	return {
		code,
		expiresAt,
		label,
		issuerId: issuerId || null,
		tenantId: tenantId || null,
	};
}

async function verifyIssuerAuthorizationCode(value, { db: dbOverride } = {}) {
	const normalized = normalizeCode(value);
	if (!normalized) return false;

	const hash = hashAuthorizationCode(normalized);
	if (!dbOverride) {
		return prisma.issuerAuthorizationCode.findFirst({
			where: {
				codeHash: hash,
				status: { not: 'revoked' },
				expiresAt: { gt: new Date() },
			},
		});
	}

	const db = dbOverride;

	return (
		(db.issuer_authorization_codes || []).find((record) => {
			if (record.status === 'revoked') return false;
			if (record.codeHash !== hash) return false;
			if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
				return false;
			}
			return true;
		}) || false
	);
}

export { createIssuerAuthorizationCode, generateIssuerAuthorizationCode, hashAuthorizationCode, verifyIssuerAuthorizationCode };
