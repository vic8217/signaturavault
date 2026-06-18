const ACCURA_ROLE_PREFIXES = {
	SADM: 'System Admin',
	CADM: 'Company Admin',
	UADM: 'User Admin',
	CASH: 'Cashier',
	SALE: 'Sales Clerk',
	INVT: 'Inventory Clerk',
	ACCT: 'Accounting Clerk',
	BOOK: 'Bookkeeping Clerk',
	APCL: 'Accounts Payable Clerk',
	ARCL: 'Accounts Receivable Clerk',
	PAYR: 'Payroll Clerk',
	PROC: 'Procurement Clerk',
	MFGC: 'Manufacturing Clerk',
	CRMS: 'CRM Staff',
	SRMS: 'SRM Staff',
	BRMG: 'Branch Manager',
	SUPV: 'Module Supervisor',
	AUDT: 'Auditor / Viewer',
	// Backward-compatible aliases used by existing ACCURA links.
	CRM: 'CRM User',
	SRM: 'SRM User',
	MFG: 'Manufacturing User',
};

const ALLOWED_REGISTRATION_SOURCES = new Set(['accura', 'haven', 'issuer']);

function normalizeRegistrationSource(value) {
	const source = String(value || '').trim().toLowerCase();
	if (!source) return { source: '', error: '' };
	if (!ALLOWED_REGISTRATION_SOURCES.has(source)) {
		return { source: '', error: 'Unknown registration source' };
	}
	return { source, error: '' };
}

function normalizeCompanyCode(value) {
	return String(value || '')
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 32);
}

function normalizeCompanyName(value) {
	return String(value || '').trim().slice(0, 120);
}

function normalizeCompanyId(value) {
	return String(value || '').trim().slice(0, 120);
}

function normalizeRegistrationKeyId(value) {
	return String(value || '').trim().slice(0, 160);
}

function normalizeAccuraRole(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_ -]/g, '')
		.replace(/[\s-]+/g, '_')
		.slice(0, 80);
}

function normalizeAccuraRolePrefix(value) {
	return String(value || '')
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, '')
		.slice(0, 8);
}

function registrationContextFromParams(params = {}) {
	const { source, error } = normalizeRegistrationSource(params.source);
	return {
		source,
		error,
		companyId: normalizeCompanyId(params.companyId),
		companyCode: normalizeCompanyCode(params.companyCode),
		companyName: normalizeCompanyName(params.companyName),
		role: normalizeAccuraRole(params.role),
		rolePrefix: normalizeAccuraRolePrefix(params.rolePrefix),
		registrationKeyId: normalizeRegistrationKeyId(params.registrationKeyId),
		expiresAt: String(params.expiresAt || '').trim(),
		tokenId: String(params.tokenId || '').trim(),
	};
}

function rolePrefixFromAccuraSignaturaId(signaturaId = '') {
	const id = String(signaturaId || '').trim().toUpperCase();
	if (!id.startsWith('SIG-ACCURA-')) return '';
	if (id.startsWith('SIG-ACCURA-SADM-')) return 'SADM';
	const rolePrefixPattern = Object.keys(ACCURA_ROLE_PREFIXES)
		.filter((prefix) => prefix !== 'SADM')
		.join('|');
	const roleScopedMatch = id.match(new RegExp(`^SIG-ACCURA-(${rolePrefixPattern})-.+$`));
	if (roleScopedMatch) return roleScopedMatch[1];
	const companyScopedMatch = id.match(
		new RegExp(`^SIG-ACCURA-(.+)-(${rolePrefixPattern})-.+$`),
	);
	return companyScopedMatch?.[2] || '';
}

function resolveAccuraAuthorizationRolePrefix(rolePrefix, signaturaId = '') {
	const fromId = rolePrefixFromAccuraSignaturaId(signaturaId);
	if (fromId) return fromId;
	return normalizeAccuraRolePrefix(rolePrefix);
}

function validateAccuraRegistrationContext(context, { returnUrl = '' } = {}) {
	if (context.source !== 'accura') return '';
	const isSystemAdmin = context.rolePrefix === 'SADM';
	if (
		!context.role ||
		!context.rolePrefix ||
		!returnUrl ||
		!ACCURA_ROLE_PREFIXES[context.rolePrefix] ||
		(!isSystemAdmin && (!context.companyId || !context.companyCode))
	) {
		return 'Invalid ACCURA registration context.';
	}
	return '';
}

function sourceAppLabel(source) {
	const normalized = String(source || '').trim().toLowerCase();
	if (normalized === 'accura') return 'ACCURA';
	if (normalized === 'haven') return 'HAVEN';
	if (normalized === 'issuer') return 'ISSUER';
	return '';
}

export {
	ACCURA_ROLE_PREFIXES,
	ALLOWED_REGISTRATION_SOURCES,
	normalizeAccuraRole,
	normalizeAccuraRolePrefix,
	normalizeCompanyId,
	normalizeCompanyCode,
	normalizeCompanyName,
	normalizeRegistrationKeyId,
	normalizeRegistrationSource,
	registrationContextFromParams,
	resolveAccuraAuthorizationRolePrefix,
	rolePrefixFromAccuraSignaturaId,
	sourceAppLabel,
	validateAccuraRegistrationContext,
};
