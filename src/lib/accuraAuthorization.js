import crypto from 'crypto';
import { auditEvent } from './audit';
import { ACCURA_ROLE_PREFIXES } from './registrationSource';

const ACCURA_AUTHORIZATION_SOURCES = new Set(['accura', 'accura-admin']);
const ACCURA_SOURCE_APP = 'ACCURA';
const ACCURA_UNLOCK_TOKEN_TYPE = 'signatura.accura.unlock';
const DEFAULT_UNLOCK_TTL_SECONDS = 15 * 60;
const MIN_UNLOCK_TTL_SECONDS = 10 * 60;
const MAX_UNLOCK_TTL_SECONDS = 15 * 60;

const ACCURA_SENSITIVE_ACTIONS = Object.freeze({
	COMPANY_ADMIN: [
		'CREATE_COMPANY',
		'UPDATE_COMPANY_SECURITY',
		'CHANGE_COMPANY_OWNER',
		'DELETE_COMPANY',
		'MANAGE_COMPANY_KEYS',
	],
	USER_MANAGEMENT: [
		'CREATE_USER',
		'UPDATE_USER_ROLE',
		'DISABLE_USER',
		'RESET_USER_DEVICE',
		'GRANT_MODULE_ACCESS',
		'REVOKE_MODULE_ACCESS',
	],
	PAYROLL: [
		'APPROVE_PAYROLL',
		'EXPORT_PAYROLL',
		'UPDATE_PAYROLL_BANK_DETAILS',
		'RUN_PAYROLL',
	],
	CASH_PAYMENTS: [
		'APPROVE_PAYMENT',
		'RELEASE_PAYMENT',
		'UPDATE_BANK_ACCOUNT',
		'VOID_PAYMENT',
	],
	ACCOUNTING: [
		'POST_JOURNAL',
		'REVERSE_JOURNAL',
		'CLOSE_PERIOD',
		'EXPORT_GENERAL_LEDGER',
	],
	INVENTORY: [
		'ADJUST_STOCK',
		'WRITE_OFF_INVENTORY',
		'APPROVE_STOCK_TRANSFER',
		'UPDATE_COSTING',
	],
	SALES: [
		'APPROVE_CREDIT_MEMO',
		'CHANGE_PRICE_LIST',
		'EXPORT_CUSTOMERS',
		'VOID_INVOICE',
	],
	PROCUREMENT: [
		'APPROVE_PURCHASE_ORDER',
		'APPROVE_VENDOR',
		'CHANGE_VENDOR_BANK_DETAILS',
		'CANCEL_PURCHASE_ORDER',
	],
	CRM: ['EXPORT_CONTACTS', 'MERGE_CUSTOMERS', 'DELETE_CUSTOMER'],
	SRM: ['EXPORT_SUPPLIERS', 'MERGE_SUPPLIERS', 'DELETE_SUPPLIER'],
	MANUFACTURING: [
		'APPROVE_PRODUCTION_ORDER',
		'CHANGE_BOM',
		'CLOSE_PRODUCTION_ORDER',
	],
	REPORTS: ['MASS_EXPORT', 'EXPORT_FINANCIAL_REPORT', 'EXPORT_AUDIT_REPORT'],
	SYSTEM_ADMIN: [
		'SYSTEM_ADMIN_OVERRIDE',
		'KEY_ROTATION',
		'DELETE_AUDIT_LOGS',
		'TRANSFER_OWNERSHIP',
		'TENANT_DELETION',
	],
});

const ACCURA_CRITICAL_ACTIONS = new Set([
	'TENANT_DELETION',
	'DELETE_COMPANY',
	'KEY_ROTATION',
	'MANAGE_COMPANY_KEYS',
	'MASS_EXPORT',
	'SYSTEM_ADMIN_OVERRIDE',
	'DELETE_AUDIT_LOGS',
	'TRANSFER_OWNERSHIP',
	'CHANGE_COMPANY_OWNER',
]);

const ACCURA_ACTION_TO_MODULE = new Map(
	Object.entries(ACCURA_SENSITIVE_ACTIONS).flatMap(([module, actions]) =>
		actions.map((action) => [action, module]),
	),
);

function normalizeAccuraClientId(value) {
	return String(value || '').trim().toLowerCase();
}

function configuredAccuraClientId() {
	return normalizeAccuraClientId(
		process.env.SIGNATURA_CLIENT_ID ||
			process.env.ACCURA_CLIENT_ID ||
			'accura',
	);
}

function isAllowedAccuraClientId(value) {
	const clientId = normalizeAccuraClientId(value);
	return Boolean(clientId) && clientId === configuredAccuraClientId();
}

function normalizeAccuraAuthorizationSource(value) {
	return String(value || '').trim().toLowerCase();
}

function isAllowedAccuraAuthorizationSource(value) {
	const source = normalizeAccuraAuthorizationSource(value);
	return !source || ACCURA_AUTHORIZATION_SOURCES.has(source);
}

function isAllowedAccuraRolePrefix(value) {
	return Boolean(value && ACCURA_ROLE_PREFIXES[value]);
}

function normalizeAccuraModule(value) {
	return String(value || '')
		.trim()
		.toUpperCase()
		.replace(/[\s/-]+/g, '_');
}

function normalizeAccuraAction(value) {
	return String(value || '')
		.trim()
		.toUpperCase()
		.replace(/[\s/-]+/g, '_');
}

function moduleForAccuraAction(action) {
	return ACCURA_ACTION_TO_MODULE.get(normalizeAccuraAction(action)) || null;
}

function isKnownAccuraSensitiveAction({ module, action } = {}) {
	const normalizedModule = normalizeAccuraModule(module);
	const normalizedAction = normalizeAccuraAction(action);
	const allowedActions = ACCURA_SENSITIVE_ACTIONS[normalizedModule] || [];
	return allowedActions.includes(normalizedAction);
}

function isCriticalAccuraAction(action) {
	return ACCURA_CRITICAL_ACTIONS.has(normalizeAccuraAction(action));
}

function normalizeMetadataList(value) {
	if (!value) return [];
	const source = Array.isArray(value) ? value : String(value).split(',');
	return source
		.map((item) => normalizeAccuraAction(item))
		.filter(Boolean);
}

function listIncludesScope(list, candidates) {
	if (list.includes('*')) return true;
	return candidates.some((candidate) =>
		list.includes(normalizeAccuraAction(candidate)),
	);
}

function sanitizeAccuraAppMetadata(link = {}) {
	return {
		sourceApp: link.sourceApp || null,
		companyCode: link.companyCode || null,
		companyId: link.companyId || null,
		tenantId: link.tenantId || link.companyId || null,
		accuraUserId: link.accuraUserId || null,
		accuraRole: link.accuraRole || link.role || null,
		accuraModuleAccess: Array.isArray(link.moduleAccess)
			? link.moduleAccess
			: [],
		accuraPermissionSet: Array.isArray(link.permissionSet)
			? link.permissionSet
			: [],
		registrationContext: link.registrationContext || null,
		trustedDeviceStatus: link.trustedDeviceStatus || null,
		rolePrefix: link.rolePrefix || null,
	};
}

function accuraMetadataAllowsAction(link, { module, action } = {}) {
	const metadata = sanitizeAccuraAppMetadata(link);
	const normalizedModule = normalizeAccuraModule(module);
	const normalizedAction = normalizeAccuraAction(action);
	if (!link || link.status !== 'ACTIVE') return false;
	if (metadata.sourceApp !== ACCURA_SOURCE_APP) return false;
	if (!isAllowedAccuraRolePrefix(metadata.rolePrefix)) return false;
	if (!isKnownAccuraSensitiveAction({ module: normalizedModule, action })) {
		return false;
	}
	if (
		metadata.trustedDeviceStatus &&
		normalizeAccuraAction(metadata.trustedDeviceStatus) !== 'TRUSTED'
	) {
		return false;
	}

	const moduleAccess = normalizeMetadataList(metadata.accuraModuleAccess);
	if (!moduleAccess.length) return false;
	if (!listIncludesScope(moduleAccess, [normalizedModule])) return false;

	const permissionSet = normalizeMetadataList(metadata.accuraPermissionSet);
	if (!permissionSet.length) return false;
	return listIncludesScope(permissionSet, [
		normalizedAction,
		`${normalizedModule}:${normalizedAction}`,
	]);
}

function unlockTokenSecret() {
	const secret =
		process.env.ACCURA_UNLOCK_TOKEN_SECRET ||
		process.env.SIGNATURA_UNLOCK_TOKEN_SECRET ||
		process.env.SIGNATURA_CLIENT_SECRET ||
		process.env.SESSION_SECRET;
	if (!secret) throw new Error('ACCURA unlock token secret is not configured');
	return secret;
}

function base64urlJson(value) {
	return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signUnlockPayload(encodedPayload) {
	return crypto
		.createHmac('sha256', unlockTokenSecret())
		.update(encodedPayload)
		.digest('base64url');
}

function clampUnlockTtl(ttlSeconds) {
	const requested = Number(ttlSeconds) || DEFAULT_UNLOCK_TTL_SECONDS;
	return Math.min(
		MAX_UNLOCK_TTL_SECONDS,
		Math.max(MIN_UNLOCK_TTL_SECONDS, requested),
	);
}

function issueAccuraUnlockToken({
	signaturaId,
	userId,
	accuraUserId,
	companyCode,
	companyId,
	tenantId,
	module,
	action,
	resourceId,
	deviceId,
	sessionId,
	clientId,
	challengeId,
	ttlSeconds,
} = {}) {
	const now = Math.floor(Date.now() / 1000);
	const ttl = clampUnlockTtl(ttlSeconds);
	const normalizedModule = normalizeAccuraModule(module);
	const normalizedAction = normalizeAccuraAction(action);
	const payload = {
		typ: ACCURA_UNLOCK_TOKEN_TYPE,
		v: 1,
		jti: crypto.randomUUID(),
		signaturaId,
		userId,
		accuraUserId: accuraUserId || null,
		companyCode: companyCode || null,
		companyId: companyId || null,
		tenantId: tenantId || companyId || null,
		module: normalizedModule,
		action: normalizedAction,
		resourceId: resourceId || null,
		deviceId,
		sessionId,
		clientId: clientId || null,
		challengeId: challengeId || null,
		iat: now,
		exp: now + ttl,
	};
	const encodedPayload = base64urlJson(payload);
	const signature = signUnlockPayload(encodedPayload);
	return {
		token: `${encodedPayload}.${signature}`,
		payload,
		expiresAt: new Date(payload.exp * 1000),
	};
}

function timingSafeEqualString(left, right) {
	const leftBuffer = Buffer.from(String(left || ''));
	const rightBuffer = Buffer.from(String(right || ''));
	return (
		leftBuffer.length === rightBuffer.length &&
		crypto.timingSafeEqual(leftBuffer, rightBuffer)
	);
}

function decodeAccuraUnlockToken(token) {
	const [encodedPayload, signature, extra] = String(token || '').split('.');
	if (!encodedPayload || !signature || extra) {
		return { valid: false, reason: 'malformed' };
	}
	const expected = signUnlockPayload(encodedPayload);
	if (!timingSafeEqualString(signature, expected)) {
		return { valid: false, reason: 'invalid_signature' };
	}
	let payload;
	try {
		payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
	} catch {
		return { valid: false, reason: 'malformed' };
	}
	if (payload?.typ !== ACCURA_UNLOCK_TOKEN_TYPE || payload.v !== 1) {
		return { valid: false, reason: 'invalid_type' };
	}
	if (Number(payload.exp) <= Math.floor(Date.now() / 1000)) {
		return { valid: false, reason: 'expired', payload };
	}
	return { valid: true, payload };
}

function scopeMatches(payload, expected = {}) {
	const checks = [
		['signaturaId', expected.signaturaId],
		['userId', expected.userId],
		['accuraUserId', expected.accuraUserId],
		['companyCode', expected.companyCode],
		['companyId', expected.companyId],
		['tenantId', expected.tenantId || expected.companyId],
		['module', expected.module ? normalizeAccuraModule(expected.module) : null],
		['action', expected.action ? normalizeAccuraAction(expected.action) : null],
		['resourceId', expected.resourceId],
		['deviceId', expected.deviceId],
		['sessionId', expected.sessionId],
	];
	return checks.every(([field, expectedValue]) => {
		if (expectedValue === null || expectedValue === undefined || expectedValue === '') {
			return true;
		}
		return String(payload[field] || '') === String(expectedValue);
	});
}

function verifyAccuraUnlockToken(token, expectedScope = {}) {
	const decoded = decodeAccuraUnlockToken(token);
	if (!decoded.valid) return decoded;
	if (!scopeMatches(decoded.payload, expectedScope)) {
		return { valid: false, reason: 'scope_mismatch', payload: decoded.payload };
	}
	return decoded;
}

async function auditAccuraSecurityEvent({
	link,
	user,
	action,
	result,
	module,
	accuraAction,
	resourceId,
	deviceId,
	sessionId,
	reason,
	ipAddress,
} = {}) {
	const metadata = sanitizeAccuraAppMetadata(link);
	const tenantId = metadata.tenantId || metadata.companyId || metadata.companyCode;
	if (!tenantId) return null;
	return auditEvent({
		tenantId,
		userId: user?.id || link?.userId || null,
		action,
		result,
		ipAddress,
		device: deviceId || null,
		details: {
			signaturaId: user?.signaturaId || link?.signaturaId || null,
			accuraUserId: metadata.accuraUserId,
			companyId: metadata.companyId,
			companyCode: metadata.companyCode,
			module: normalizeAccuraModule(module),
			accuraAction: normalizeAccuraAction(accuraAction),
			resourceId: resourceId || null,
			deviceId: deviceId || null,
			sessionId: sessionId || null,
			reason: reason || null,
			timestamp: new Date().toISOString(),
		},
	});
}

export {
	ACCURA_ACTION_TO_MODULE,
	ACCURA_AUTHORIZATION_SOURCES,
	ACCURA_CRITICAL_ACTIONS,
	ACCURA_SENSITIVE_ACTIONS,
	ACCURA_SOURCE_APP,
	accuraMetadataAllowsAction,
	auditAccuraSecurityEvent,
	configuredAccuraClientId,
	decodeAccuraUnlockToken,
	isCriticalAccuraAction,
	isAllowedAccuraAuthorizationSource,
	isAllowedAccuraClientId,
	isAllowedAccuraRolePrefix,
	isKnownAccuraSensitiveAction,
	issueAccuraUnlockToken,
	moduleForAccuraAction,
	normalizeAccuraAction,
	normalizeAccuraAuthorizationSource,
	normalizeAccuraClientId,
	normalizeAccuraModule,
	sanitizeAccuraAppMetadata,
	verifyAccuraUnlockToken,
};
