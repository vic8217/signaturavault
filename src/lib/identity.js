import crypto from 'crypto';

const SIGNATURA_ID_PREFIX = 'SIG-';
const SIGNATURA_ID_PREFIXES = {
	DOCUMENT_OWNER: 'SIG-U-',
	ISSUER: 'SIG-I-',
	ADMIN: 'SIG-A-',
};

const SIGNATURA_ACCOUNT_TYPES = {
	DOCUMENT_OWNER: 'user',
	ISSUER: 'issuer',
	ADMIN: 'admin',
};

function normalizeSignaturaId(value) {
	const normalized = String(value || '').trim().toUpperCase();
	if (!normalized) return '';
	return normalized.startsWith(SIGNATURA_ID_PREFIX)
		? normalized
		: `${SIGNATURA_ID_PREFIX}${normalized.replace(/^SIG[-_]?/i, '')}`;
}

function normalizeSignaturaAccountType(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (normalized === SIGNATURA_ACCOUNT_TYPES.ISSUER) {
		return SIGNATURA_ACCOUNT_TYPES.ISSUER;
	}
	if (normalized === SIGNATURA_ACCOUNT_TYPES.ADMIN) {
		return SIGNATURA_ACCOUNT_TYPES.ADMIN;
	}
	return SIGNATURA_ACCOUNT_TYPES.DOCUMENT_OWNER;
}

function signaturaPrefixForAccountType(accountType) {
	const normalized = normalizeSignaturaAccountType(accountType);
	if (normalized === SIGNATURA_ACCOUNT_TYPES.ISSUER) {
		return SIGNATURA_ID_PREFIXES.ISSUER;
	}
	if (normalized === SIGNATURA_ACCOUNT_TYPES.ADMIN) {
		return SIGNATURA_ID_PREFIXES.ADMIN;
	}
	return SIGNATURA_ID_PREFIXES.DOCUMENT_OWNER;
}

function getSignaturaAccountType(signaturaId) {
	const normalized = normalizeSignaturaId(signaturaId);
	if (normalized.startsWith(SIGNATURA_ID_PREFIXES.ISSUER)) {
		return SIGNATURA_ACCOUNT_TYPES.ISSUER;
	}
	if (normalized.startsWith(SIGNATURA_ID_PREFIXES.ADMIN)) {
		return SIGNATURA_ACCOUNT_TYPES.ADMIN;
	}
	return SIGNATURA_ACCOUNT_TYPES.DOCUMENT_OWNER;
}

function generateSignaturaId(accountType = SIGNATURA_ACCOUNT_TYPES.DOCUMENT_OWNER) {
	const token = crypto.randomBytes(4).toString('hex').toUpperCase();
	return `${signaturaPrefixForAccountType(accountType)}${token.slice(0, 4)}-${token.slice(4)}`;
}

function generateAccuraSignaturaId(companyCode, rolePrefix) {
	const prefix = String(rolePrefix || '')
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '')
		.slice(0, 8);
	const code = String(companyCode || '')
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 32);
	if (prefix === 'SADM') {
		const token = crypto.randomBytes(5).toString('hex').toUpperCase();
		return `SIG-ACCURA-SADM-${token.slice(0, 6)}-${token.slice(6)}`;
	}
	if (!code) throw new Error('ACCURA company code is required');
	if (!prefix) throw new Error('ACCURA role prefix is required');
	const token = crypto.randomBytes(5).toString('hex').toUpperCase();
	return `SIG-ACCURA-${code}-${prefix}-${token.slice(0, 6)}-${token.slice(6)}`;
}

async function createUniqueSignaturaId(
	prisma,
	accountType = SIGNATURA_ACCOUNT_TYPES.DOCUMENT_OWNER,
) {
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const signaturaId = generateSignaturaId(accountType);
		const existing = await prisma.user.findUnique({
			where: { signaturaId },
			select: { id: true },
		});
		if (!existing) return signaturaId;
	}
	throw new Error('Unable to allocate Signatura ID');
}

async function createUniqueAccuraSignaturaId(prisma, companyCode, rolePrefix) {
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const signaturaId = generateAccuraSignaturaId(companyCode, rolePrefix);
		const existing = await prisma.user.findUnique({
			where: { signaturaId },
			select: { id: true },
		});
		if (!existing) return signaturaId;
	}
	throw new Error('Unable to allocate ACCURA Signatura ID');
}

function userPublicIdentity(user) {
	return {
		id: user.id,
		signaturaId: user.signaturaId,
		accountStatus: user.accountStatus || 'active',
		trustLevel: user.trustLevel || 1,
	};
}

export {
	SIGNATURA_ACCOUNT_TYPES,
	SIGNATURA_ID_PREFIX,
	SIGNATURA_ID_PREFIXES,
	createUniqueSignaturaId,
	createUniqueAccuraSignaturaId,
	generateAccuraSignaturaId,
	generateSignaturaId,
	getSignaturaAccountType,
	normalizeSignaturaAccountType,
	normalizeSignaturaId,
	signaturaPrefixForAccountType,
	userPublicIdentity,
};
