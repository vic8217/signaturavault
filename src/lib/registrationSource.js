const ACCURA_ROLE_PREFIXES = {
	SADM: 'System Admin',
	CADM: 'Company Admin',
	UADM: 'User Admin',
	ACCT: 'Accounting Staff',
	INVT: 'Inventory Clerk',
	CASH: 'Cashier',
	PAYR: 'Payroll Staff',
	CRM: 'CRM User',
	SRM: 'SRM User',
	SALE: 'Sales Order User',
	MFG: 'Manufacturing User',
	PROC: 'Procurement User',
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
		companyCode: normalizeCompanyCode(params.companyCode),
		companyName: normalizeCompanyName(params.companyName),
		role: normalizeAccuraRole(params.role),
		rolePrefix: normalizeAccuraRolePrefix(params.rolePrefix),
	};
}

function validateAccuraRegistrationContext(context, { returnUrl = '' } = {}) {
	if (context.source !== 'accura') return '';
	const isSystemAdmin = context.rolePrefix === 'SADM';
	if (
		!context.role ||
		!context.rolePrefix ||
		!returnUrl ||
		!ACCURA_ROLE_PREFIXES[context.rolePrefix] ||
		(!isSystemAdmin && (!context.companyCode || !context.companyName))
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
	normalizeCompanyCode,
	normalizeCompanyName,
	normalizeRegistrationSource,
	registrationContextFromParams,
	sourceAppLabel,
	validateAccuraRegistrationContext,
};
