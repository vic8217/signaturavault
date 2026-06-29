import crypto from 'crypto';
import {
	isPhoneUnreachableAccuraHost,
	isPhoneUnreachableAccuraReturnUrl,
	normalizeExternalReturnUrl,
} from './externalReturnUrl';
import {
	ACCURA_ROLE_PREFIXES,
	normalizeAccuraRolePrefix,
	normalizeCompanyCode,
	normalizeCompanyName,
} from './registrationSource';
import {
	configuredAccuraClientId,
	isAllowedAccuraClientId,
	normalizeAccuraClientId,
} from './accuraAuthorization';

const TOKEN_TYPE = 'signatura.accura.registration_handoff';
const CALLBACK_TOKEN_TYPE = 'signatura.accura.onboarding_callback';
const AUTHORIZATION_CODE_TYPE = 'signatura.accura.onboarding_authorization';
const TOKEN_VERSION = 1;
const MAX_HANDOFF_TTL_MS = 10 * 60 * 1000;
const RESERVED_STAFF_PREFIXES = new Set(['CADM', 'SADM']);
const ACCURA_REGISTRATION_TYPES = new Set([
	'staff',
	'company_admin',
	'system_admin',
]);
const HANDOFF_ORIGIN_DEVICES = new Set(['desktop', 'mobile']);
const HANDOFF_FLOW_TYPES = new Set(['cross_device_qr', 'same_device_deeplink']);

const ACCURA_PLATFORM_SYSTEM_ADMIN = {
	companyId: 'accura-platform',
	companyCode: 'ACCURA',
	companyName: 'ACCURA Platform',
	registrationKeyId: 'platform-system-admin',
};

function isPlatformSystemAdminHandoff(context = {}) {
	return (
		context.roleCode === 'SADM' &&
		normalizeCompanyId(context.companyId) === ACCURA_PLATFORM_SYSTEM_ADMIN.companyId &&
		normalizeCompanyCode(context.companyCode) === ACCURA_PLATFORM_SYSTEM_ADMIN.companyCode &&
		normalizeRegistrationKeyId(context.registrationKeyId) ===
			ACCURA_PLATFORM_SYSTEM_ADMIN.registrationKeyId
	);
}
const ONBOARDING_MODES = new Set(['create', 'link']);

function base64urlJson(value) {
	return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function timingSafeEqualString(left, right) {
	const leftBuffer = Buffer.from(String(left || ''));
	const rightBuffer = Buffer.from(String(right || ''));
	return (
		leftBuffer.length === rightBuffer.length &&
		crypto.timingSafeEqual(leftBuffer, rightBuffer)
	);
}

function handoffSecret() {
	const secret =
		process.env.ACCURA_REGISTRATION_HANDOFF_SECRET ||
		process.env.ACCURA_CALLBACK_SECRET ||
		process.env.SIGNATURA_CLIENT_SECRET ||
		process.env.SESSION_SECRET;
	if (!secret) throw new Error('ACCURA registration handoff secret is not configured');
	return secret;
}

function callbackSecret() {
	const secret =
		process.env.ACCURA_REGISTRATION_CALLBACK_SECRET ||
		process.env.ACCURA_CALLBACK_SECRET ||
		process.env.ACCURA_REGISTRATION_HANDOFF_SECRET ||
		process.env.SIGNATURA_CLIENT_SECRET ||
		process.env.SESSION_SECRET;
	if (!secret) throw new Error('ACCURA registration callback secret is not configured');
	return secret;
}

function signValue(value, secret) {
	return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function normalizeRoleName(value, fallbackPrefix = '') {
	const fallback = ACCURA_ROLE_PREFIXES[fallbackPrefix] || '';
	return String(value || fallback).trim().slice(0, 120);
}

function normalizeCompanyId(value) {
	return String(value || '').trim().slice(0, 120);
}

function normalizeRegistrationKeyId(value) {
	return String(value || '').trim().slice(0, 160);
}

function normalizeTimestamp(value) {
	const time = value instanceof Date ? value.getTime() : Date.parse(String(value || ''));
	return Number.isFinite(time) ? new Date(time) : null;
}

function normalizeOnboardingMode(value) {
	const mode = String(value || 'create').trim().toLowerCase();
	return ONBOARDING_MODES.has(mode) ? mode : 'create';
}

function normalizeOriginDevice(value) {
	const normalized = String(value || 'desktop').trim().toLowerCase();
	return HANDOFF_ORIGIN_DEVICES.has(normalized) ? normalized : 'desktop';
}

function normalizeFlowType(value) {
	const normalized = String(value || 'cross_device_qr').trim().toLowerCase();
	return HANDOFF_FLOW_TYPES.has(normalized) ? normalized : 'cross_device_qr';
}

function normalizeAccuraRegistrationType(value, roleCode = '') {
	const normalized = String(value || '').trim().toLowerCase();
	if (ACCURA_REGISTRATION_TYPES.has(normalized)) return normalized;
	if (roleCode === 'SADM') return 'system_admin';
	return 'staff';
}

function normalizeSignaturaId(value) {
	return String(value || '')
		.trim()
		.toUpperCase()
		.replace(/^SIG[-_]?/i, 'SIG-')
		.slice(0, 120);
}

function canonicalPayload(payload) {
	const requestId = String(
		payload.requestId || payload.jti || payload.tokenId || crypto.randomUUID(),
	);
	const challengeId = String(payload.challengeId || requestId).trim();
	const state = String(payload.state || payload.requestId || requestId);
	const nonce = String(payload.nonce || crypto.randomUUID());
	const roleCode = normalizeAccuraRolePrefix(payload.roleCode || payload.rolePrefix);
	return {
		typ: TOKEN_TYPE,
		v: TOKEN_VERSION,
		jti: requestId,
		challengeId,
		requestId,
		state,
		nonce,
		clientId: normalizeAccuraClientId(payload.clientId) || configuredAccuraClientId(),
		sourceApp: 'accura',
		companyId: normalizeCompanyId(payload.companyId),
		companyCode: normalizeCompanyCode(payload.companyCode),
		companyName: normalizeCompanyName(payload.companyName),
		roleCode,
		rolePrefix: roleCode,
		roleName: normalizeRoleName(
			payload.roleName || payload.role,
			roleCode,
		),
		registrationType: normalizeAccuraRegistrationType(
			payload.registrationType || payload.registration_type,
			roleCode,
		),
		registrationKeyId: normalizeRegistrationKeyId(payload.registrationKeyId),
		returnUrl: normalizeExternalReturnUrl(payload.returnUrl),
		mode: normalizeOnboardingMode(payload.mode),
		originDevice: normalizeOriginDevice(payload.originDevice),
		flowType: normalizeFlowType(payload.flowType),
		linkSignaturaId: normalizeSignaturaId(payload.linkSignaturaId || ''),
		expiresAt:
			normalizeTimestamp(payload.expiresAt)?.toISOString() ||
			new Date(Date.now() + 5 * 60 * 1000).toISOString(),
	};
}

function validateContext(context) {
	if (context.sourceApp !== 'accura') return 'Invalid ACCURA registration source.';
	if (!isAllowedAccuraClientId(context.clientId)) {
		return 'Invalid ACCURA client identifier.';
	}
	if (!context.returnUrl) return 'Invalid ACCURA return URL.';
	if (!context.roleCode || !ACCURA_ROLE_PREFIXES[context.roleCode]) {
		return 'Invalid ACCURA role.';
	}
	if (!context.requestId || !context.state || !context.nonce) {
		return 'Invalid ACCURA onboarding request metadata.';
	}
	if (context.mode === 'link' && !context.linkSignaturaId) {
		return 'ACCURA link requests must include an existing Signatura ID.';
	}
	if (isPlatformSystemAdminHandoff(context)) {
		if (new Date(context.expiresAt) <= new Date()) {
			return 'ACCURA system admin registration session expired. Start again from ACCURA.';
		}
		if (new Date(context.expiresAt).getTime() > Date.now() + MAX_HANDOFF_TTL_MS) {
			return 'ACCURA registration handoff token lifetime is too long.';
		}
		return '';
	}
	if (!context.companyId || !context.companyCode) {
		return 'Invalid ACCURA registration company.';
	}
	if (!context.registrationKeyId) {
		return 'Invalid ACCURA registration key.';
	}
	if (
		context.roleCode === 'CADM' &&
		context.registrationType !== 'company_admin'
	) {
		return 'ACCURA Company Admin registration requires a validated Company Admin registration key.';
	}
	if (
		context.registrationType === 'company_admin' &&
		context.roleCode !== 'CADM'
	) {
		return 'ACCURA Company Admin registration must use the CADM role.';
	}
	if (RESERVED_STAFF_PREFIXES.has(context.roleCode)) {
		if (context.roleCode !== 'CADM' || context.registrationType !== 'company_admin') {
			return 'ACCURA staff registration keys cannot create admin Signatura IDs.';
		}
	}
	if (new Date(context.expiresAt) <= new Date()) {
		return 'ACCURA registration session expired. Please ask your Company Admin to generate a new registration key.';
	}
	if (new Date(context.expiresAt).getTime() > Date.now() + MAX_HANDOFF_TTL_MS) {
		return 'ACCURA registration handoff token lifetime is too long.';
	}
	return '';
}

function issueAccuraRegistrationHandoffToken(payload) {
	const canonical = canonicalPayload(payload);
	const error = validateContext(canonical);
	if (error) {
		const tokenError = new Error(error);
		tokenError.status = 400;
		throw tokenError;
	}
	const encoded = base64urlJson(canonical);
	return `${encoded}.${signValue(encoded, handoffSecret())}`;
}

function verifyAccuraRegistrationHandoffToken(token) {
	const [encodedPayload, signature, extra] = String(token || '').split('.');
	if (!encodedPayload || !signature || extra) {
		return { valid: false, reason: 'malformed' };
	}
	let expected;
	try {
		expected = signValue(encodedPayload, handoffSecret());
	} catch {
		return { valid: false, reason: 'secret_not_configured' };
	}
	if (!timingSafeEqualString(signature, expected)) {
		return { valid: false, reason: 'invalid_signature' };
	}
	let parsed;
	try {
		parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
	} catch {
		return { valid: false, reason: 'malformed' };
	}
	const context = canonicalPayload(parsed);
	const error = validateContext(context);
	if (error) return { valid: false, reason: 'invalid_context', error, context };
	return { valid: true, context };
}

function accuraRegistrationContextForForm(context) {
	return {
		source: 'accura',
		clientId: context.clientId,
		companyId: context.companyId,
		companyCode: context.companyCode,
		companyName: context.companyName,
		role: context.roleName,
		rolePrefix: context.roleCode,
		registrationType: context.registrationType,
		registrationKeyId: context.registrationKeyId,
		returnUrl: context.returnUrl,
		expiresAt: context.expiresAt,
		tokenId: context.jti,
		challengeId: context.challengeId,
		requestId: context.requestId,
		state: context.state,
		nonce: context.nonce,
		mode: context.mode,
		originDevice: context.originDevice,
		flowType: context.flowType,
		linkSignaturaId: context.linkSignaturaId,
	};
}

function callbackProofPayload({
	signaturaId,
	userId,
	signaturaSubjectId,
	companyId,
	companyCode,
	roleCode,
	rolePrefix,
	registrationKeyId,
	registrationStatus = 'SUCCESS',
	requestId = '',
	state = '',
	nonce = '',
	timestamp = new Date().toISOString(),
}) {
	const resolvedRolePrefix = normalizeAccuraRolePrefix(rolePrefix || roleCode);
	return {
		typ: CALLBACK_TOKEN_TYPE,
		v: TOKEN_VERSION,
		signaturaId,
		signaturaSubjectId: signaturaSubjectId || userId || null,
		userId: userId || signaturaSubjectId || null,
		sourceApp: 'accura',
		companyId,
		companyCode,
		roleCode: resolvedRolePrefix,
		rolePrefix: resolvedRolePrefix,
		registrationKeyId,
		registrationStatus,
		requestId,
		state,
		nonce,
		timestamp,
	};
}

function signAccuraRegistrationCallback(payload) {
	const canonical = callbackProofPayload(payload);
	const encoded = base64urlJson(canonical);
	return {
		payload: canonical,
		proof: signValue(encoded, callbackSecret()),
		encodedPayload: encoded,
	};
}

function verifyAccuraRegistrationCallback(encodedPayload, proof) {
	const encoded = String(encodedPayload || '').trim();
	const signature = String(proof || '').trim();
	if (!encoded || !signature) {
		return { valid: false, reason: 'malformed' };
	}
	let expected;
	try {
		expected = signValue(encoded, callbackSecret());
	} catch {
		return { valid: false, reason: 'secret_not_configured' };
	}
	if (!timingSafeEqualString(signature, expected)) {
		return { valid: false, reason: 'invalid_signature' };
	}
	let parsed;
	try {
		parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
	} catch {
		return { valid: false, reason: 'malformed' };
	}
	if (parsed?.typ !== CALLBACK_TOKEN_TYPE || parsed.v !== TOKEN_VERSION) {
		return { valid: false, reason: 'invalid_type', payload: parsed };
	}
	if (parsed.sourceApp !== 'accura') {
		return { valid: false, reason: 'invalid_source', payload: parsed };
	}
	return { valid: true, payload: parsed };
}

function issueAccuraOnboardingAuthorizationCode(payload) {
	const signed = signAccuraRegistrationCallback(payload);
	const now = Math.floor(Date.now() / 1000);
	const authorizationPayload = {
		...signed.payload,
		typ: AUTHORIZATION_CODE_TYPE,
		v: TOKEN_VERSION,
		jti: crypto.randomUUID(),
		iat: now,
		exp: now + 10 * 60,
	};
	const encoded = base64urlJson(authorizationPayload);
	return {
		authorizationCode: `${encoded}.${signValue(encoded, callbackSecret())}`,
		payload: authorizationPayload,
		proofPayload: signed.encodedPayload,
		proof: signed.proof,
	};
}

function verifyAccuraOnboardingAuthorizationCode(authorizationCode) {
	const [encodedPayload, signature, extra] = String(authorizationCode || '').split('.');
	if (!encodedPayload || !signature || extra) {
		return { valid: false, reason: 'malformed' };
	}
	let expected;
	try {
		expected = signValue(encodedPayload, callbackSecret());
	} catch {
		return { valid: false, reason: 'secret_not_configured' };
	}
	if (!timingSafeEqualString(signature, expected)) {
		return { valid: false, reason: 'invalid_signature' };
	}
	let parsed;
	try {
		parsed = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
	} catch {
		return { valid: false, reason: 'malformed' };
	}
	if (parsed?.typ !== AUTHORIZATION_CODE_TYPE || parsed.v !== TOKEN_VERSION) {
		return { valid: false, reason: 'invalid_type', payload: parsed };
	}
	if (Number(parsed.exp) <= Math.floor(Date.now() / 1000)) {
		return { valid: false, reason: 'expired', payload: parsed };
	}
	return { valid: true, payload: parsed };
}

function signaturaPublicOrigin() {
	for (const value of [
		process.env.SIGNATURA_PUBLIC_URL,
		process.env.NEXT_PUBLIC_SIGNATURA_PUBLIC_URL,
	]) {
		const raw = String(value || '').trim();
		if (!raw) continue;
		try {
			return new URL(raw.endsWith('/') ? raw : `${raw}/`).origin;
		} catch {
			// Try next configured value.
		}
	}
	return '';
}

function accuraConfiguredOrigin() {
	const raw = String(
		process.env.ACCURA_ORIGIN || process.env.NEXT_PUBLIC_ACCURA_ORIGIN || '',
	).trim();
	if (!raw) return '';
	try {
		return new URL(raw.endsWith('/') ? raw : `${raw}/`).origin;
	} catch {
		return '';
	}
}

function rewriteUrlOrigin(urlString, targetOrigin) {
	if (!urlString || !targetOrigin) return urlString;
	try {
		const destination = new URL(urlString);
		const target = new URL(targetOrigin.endsWith('/') ? targetOrigin : `${targetOrigin}/`);
		destination.protocol = target.protocol;
		destination.host = target.host;
		return destination.toString();
	} catch {
		return urlString;
	}
}

function resolveAccuraReturnUrl(returnUrl) {
	const raw = String(returnUrl || '').trim();
	if (!raw) return '';

	let destination;
	try {
		destination = new URL(raw);
	} catch {
		return '';
	}
	if (!['https:', 'http:'].includes(destination.protocol)) return '';

	const configuredOrigin = accuraConfiguredOrigin();
	if (!configuredOrigin) {
		return normalizeExternalReturnUrl(raw) || raw;
	}

	const signaturaOrigin = signaturaPublicOrigin();
	const pointsAtSignatura =
		Boolean(signaturaOrigin) && destination.origin === signaturaOrigin;
	if (
		!isPhoneUnreachableAccuraHost(destination.hostname) &&
		!pointsAtSignatura
	) {
		return normalizeExternalReturnUrl(raw) || raw;
	}

	const rewritten = rewriteUrlOrigin(destination.toString(), configuredOrigin);
	return normalizeExternalReturnUrl(rewritten) || rewritten;
}

function buildAccuraRegistrationReturnUrl(returnUrl, payload) {
	const normalizedReturnUrl = resolveAccuraReturnUrl(returnUrl);
	if (!normalizedReturnUrl) return '';
	const signed = issueAccuraOnboardingAuthorizationCode(payload);
	const destination = new URL(normalizedReturnUrl);
	for (const [key, value] of Object.entries(signed.payload)) {
		if (['typ', 'v', 'iat', 'exp', 'jti'].includes(key)) continue;
		if (value !== null && value !== undefined) {
			destination.searchParams.set(key, String(value));
		}
	}
	destination.searchParams.set('proofPayload', signed.proofPayload);
	destination.searchParams.set('proof', signed.proof);
	destination.searchParams.set('authorizationCode', signed.authorizationCode);
	return destination.toString();
}

async function notifyAccuraRegistrationCallback(accuraReturnUrl) {
	const target = String(accuraReturnUrl || '').trim();
	if (!target || !isPhoneUnreachableAccuraReturnUrl(target)) {
		return { ok: false, skipped: true };
	}
	try {
		const response = await fetch(target, {
			method: 'GET',
			cache: 'no-store',
			redirect: 'manual',
		});
		return { ok: response.ok, status: response.status };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : 'fetch_failed',
		};
	}
}

const ACCURA_CHALLENGE_APPROVE_PATH = '/api/signatura/challenge-approve';

function accuraChallengeApproveHeaders() {
	const headers = { 'content-type': 'application/json' };
	const explicitAuth = String(
		process.env.ACCURA_CHALLENGE_APPROVE_AUTH_HEADER || '',
	).trim();
	if (explicitAuth) {
		headers.Authorization = explicitAuth;
		return headers;
	}

	const bearerToken = String(
		process.env.ACCURA_CHALLENGE_APPROVE_BEARER_TOKEN || '',
	).trim();
	if (bearerToken) {
		headers.Authorization = `Bearer ${bearerToken}`;
		return headers;
	}

	const basicUser = String(
		process.env.ACCURA_CHALLENGE_APPROVE_BASIC_USER || '',
	).trim();
	const basicPassword = String(
		process.env.ACCURA_CHALLENGE_APPROVE_BASIC_PASSWORD || '',
	);
	if (basicUser && basicPassword) {
		headers.Authorization = `Basic ${Buffer.from(
			`${basicUser}:${basicPassword}`,
		).toString('base64')}`;
	}

	return headers;
}

function normalizeConfiguredAccuraChallengeApproveUrl(configured) {
	const raw = String(configured || '').trim();
	if (!raw) return '';

	try {
		const url = new URL(raw);
		const path = url.pathname.replace(/\/+$/, '') || '';
		if (!path || path === '/') {
			url.pathname = ACCURA_CHALLENGE_APPROVE_PATH;
		}
		const candidate = url.toString();
		return normalizeExternalReturnUrl(candidate) || candidate;
	} catch {
		return '';
	}
}

function resolveAccuraChallengeApproveUrl(returnUrl) {
	const configured = normalizeConfiguredAccuraChallengeApproveUrl(
		process.env.ACCURA_CHALLENGE_APPROVE_URL,
	);
	if (configured) return configured;

	const normalizedReturnUrl = resolveAccuraReturnUrl(returnUrl);
	if (!normalizedReturnUrl) return '';

	try {
		const candidate = new URL(
			ACCURA_CHALLENGE_APPROVE_PATH,
			normalizedReturnUrl,
		).toString();
		return normalizeExternalReturnUrl(candidate) || candidate;
	} catch {
		return '';
	}
}

function resolveAccuraAppApprovalCallbackUrl(callbackUrl) {
	const configured = normalizeConfiguredAccuraChallengeApproveUrl(
		process.env.ACCURA_CHALLENGE_APPROVE_URL,
	);
	if (configured) return configured;

	const raw = String(callbackUrl || '').trim();
	if (!raw) return '';

	const resolved = resolveAccuraReturnUrl(raw);
	if (resolved) return resolved;

	try {
		const parsed = new URL(raw);
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
		return parsed.toString();
	} catch {
		return '';
	}
}

/**
 * @param {{
 *   callbackUrl?: string;
 *   challengeId?: string;
 *   signaturaId?: string;
 *   verificationToken?: string;
 *   approvedAt?: string;
 *   status?: string;
 * }} approval
 */
async function notifyAccuraAppApprovalCallback({
	callbackUrl,
	challengeId,
	signaturaId,
	verificationToken,
	approvedAt,
	status = 'APPROVED',
} = {}) {
	const target = resolveAccuraAppApprovalCallbackUrl(callbackUrl);
	const resolvedChallengeId = String(challengeId || '').trim();
	if (!target || !resolvedChallengeId) {
		return { ok: false, skipped: true, target: target || '' };
	}

	const body = {
		challengeId: resolvedChallengeId,
		signaturaId: String(signaturaId || '').trim(),
		verificationToken: String(verificationToken || '').trim(),
		status,
		approvedAt: approvedAt || new Date().toISOString(),
	};

	const attempts = 3;
	let lastResult = { ok: false, target };
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			console.info('[signatura.accura.app_approval.callback.sending]', {
				challengeId: resolvedChallengeId,
				target,
				attempt,
			});
			const response = await fetch(target, {
				method: 'POST',
				cache: 'no-store',
				headers: accuraChallengeApproveHeaders(),
				body: JSON.stringify(body),
			});
			const responseBody = await response.text().catch(() => '');
			console.info('[signatura.accura.app_approval.callback.response]', {
				challengeId: resolvedChallengeId,
				target,
				attempt,
				status: response.status,
				ok: response.ok,
				body: responseBody.slice(0, 2000),
			});
			lastResult = {
				ok: response.ok,
				status: response.status,
				target,
				body: responseBody,
			};
			if (response.ok) return lastResult;
		} catch (error) {
			console.warn('[signatura.accura.app_approval.callback.failed]', {
				challengeId: resolvedChallengeId,
				target,
				attempt,
				error: error instanceof Error ? error.message : 'fetch_failed',
			});
			lastResult = {
				ok: false,
				target,
				error: error instanceof Error ? error.message : 'fetch_failed',
			};
		}
		if (attempt < attempts) {
			await new Promise((resolve) => setTimeout(resolve, attempt * 400));
		}
	}
	return lastResult;
}

/**
 * @param {{
 *   returnUrl?: string;
 *   challengeId?: string;
 *   signaturaId?: string;
 *   verificationToken?: string;
 *   approvedAt?: string;
 *   status?: string;
 * }} approval
 */
async function notifyAccuraChallengeApproval({
	returnUrl,
	challengeId,
	signaturaId,
	verificationToken,
	approvedAt,
	status = 'APPROVED',
} = {}) {
	const target = resolveAccuraChallengeApproveUrl(returnUrl);
	const resolvedChallengeId = String(challengeId || '').trim();
	if (!target || !resolvedChallengeId) {
		return { ok: false, skipped: true };
	}

	const body = {
		challengeId: resolvedChallengeId,
		signaturaId: String(signaturaId || '').trim(),
		verificationToken: String(verificationToken || '').trim(),
		status,
		approvedAt: approvedAt || new Date().toISOString(),
	};

	try {
		console.info('[signatura.accura.registration.callback.sending]', {
			challengeId: resolvedChallengeId,
			target,
			status,
		});
		const response = await fetch(target, {
			method: 'POST',
			cache: 'no-store',
			headers: accuraChallengeApproveHeaders(),
			body: JSON.stringify(body),
		});
		const responseBody = await response.text().catch(() => '');
		console.info('[signatura.accura.registration.callback.response]', {
			challengeId: resolvedChallengeId,
			target,
			status: response.status,
			ok: response.ok,
			body: responseBody.slice(0, 2000),
		});
		return {
			ok: response.ok,
			status: response.status,
			target,
			body: responseBody,
		};
	} catch (error) {
		console.warn('[signatura.accura.registration.callback.failed]', {
			challengeId: resolvedChallengeId,
			target,
			error: error instanceof Error ? error.message : 'fetch_failed',
		});
		return {
			ok: false,
			target,
			error: error instanceof Error ? error.message : 'fetch_failed',
		};
	}
}

export {
	ONBOARDING_MODES,
	RESERVED_STAFF_PREFIXES,
	HANDOFF_FLOW_TYPES,
	HANDOFF_ORIGIN_DEVICES,
	accuraRegistrationContextForForm,
	buildAccuraRegistrationReturnUrl,
	issueAccuraOnboardingAuthorizationCode,
	issueAccuraRegistrationHandoffToken,
	notifyAccuraChallengeApproval,
	notifyAccuraAppApprovalCallback,
	notifyAccuraRegistrationCallback,
	resolveAccuraAppApprovalCallbackUrl,
	resolveAccuraChallengeApproveUrl,
	resolveAccuraReturnUrl,
	verifyAccuraOnboardingAuthorizationCode,
	verifyAccuraRegistrationCallback,
	verifyAccuraRegistrationHandoffToken,
};
