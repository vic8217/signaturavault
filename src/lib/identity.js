import crypto from 'crypto';

const SIGNATURA_ID_PREFIX = 'SIG-';

function normalizeSignaturaId(value) {
	const normalized = String(value || '').trim().toUpperCase();
	if (!normalized) return '';
	return normalized.startsWith(SIGNATURA_ID_PREFIX)
		? normalized
		: `${SIGNATURA_ID_PREFIX}${normalized.replace(/^SIG[-_]?/i, '')}`;
}

function generateSignaturaId() {
	return `${SIGNATURA_ID_PREFIX}${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

async function createUniqueSignaturaId(prisma) {
	for (let attempt = 0; attempt < 8; attempt += 1) {
		const signaturaId = generateSignaturaId();
		const existing = await prisma.user.findUnique({
			where: { signaturaId },
			select: { id: true },
		});
		if (!existing) return signaturaId;
	}
	throw new Error('Unable to allocate Signatura ID');
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
	SIGNATURA_ID_PREFIX,
	createUniqueSignaturaId,
	generateSignaturaId,
	normalizeSignaturaId,
	userPublicIdentity,
};
