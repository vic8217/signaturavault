import {
	ACCURA_QR_APP,
	normalizeChallengeId,
	normalizeShortCode,
} from './accuraQrLogin';
import { normalizeAccuraRolePrefix } from './registrationSource';

function configuredEndpoint(name) {
	const value = String(process.env[name] || '').trim();
	if (!value) throw new Error(`${name} is not configured`);
	try {
		const url = new URL(value);
		if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
		return url;
	} catch {
		throw new Error(`${name} must be an absolute HTTP or HTTPS URL`);
	}
}

function accuraClientCredentials() {
	const clientId = String(
		process.env.ACCURA_CLIENT_ID ||
			process.env.SIGNATURA_CLIENT_ID ||
			'accura',
	).trim();
	const clientSecret = String(
		process.env.ACCURA_CLIENT_SECRET ||
			process.env.SIGNATURA_CLIENT_SECRET ||
			'',
	).trim();
	if (!clientSecret) throw new Error('ACCURA_CLIENT_SECRET is not configured');
	return { clientId, clientSecret };
}

function serviceHeaders() {
	const { clientId, clientSecret } = accuraClientCredentials();
	return {
		Accept: 'application/json',
		Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
		'Content-Type': 'application/json',
		'X-Signatura-Client-Id': clientId,
	};
}

function approvalSecretHeaders() {
	const approvalSecret = String(
		process.env.SIGNATURA_QR_APPROVAL_SECRET || '',
	).trim();
	return {
		headers: approvalSecret
			? { 'X-Signatura-Approval-Secret': approvalSecret }
			: {},
		hasApprovalSecret: Boolean(approvalSecret),
		sendingAuthorizationHeader: false,
	};
}

function qrServiceHeaders() {
	const approvalSecret = approvalSecretHeaders();
	return {
		headers: {
			...serviceHeaders(),
			...approvalSecret.headers,
		},
		hasApprovalSecret: approvalSecret.hasApprovalSecret,
		sendingAuthorizationHeader: approvalSecret.sendingAuthorizationHeader,
		sendingApprovalSecretHeader: approvalSecret.hasApprovalSecret,
	};
}

async function readServiceResponse(response, fallbackMessage) {
	const raw = await response.text().catch(() => '');
	let body = {};
	try {
		body = raw ? JSON.parse(raw) : {};
	} catch {
		body = {};
	}
	if (!response.ok) {
		const error = new Error(body?.error || fallbackMessage);
		error.status = response.status;
		error.responseBody = raw.slice(0, 2000);
		throw error;
	}
	return body;
}

function normalizeChallenge(body, expected) {
	const source = body?.challenge && typeof body.challenge === 'object'
		? body.challenge
		: body;
	const app = String(source?.app || ACCURA_QR_APP).trim().toUpperCase();
	const challengeId = normalizeChallengeId(
		source?.challengeId || source?.id || expected.challengeId,
	);
	const shortCode = normalizeShortCode(source?.shortCode || expected.shortCode);
	const status = String(source?.status || 'PENDING').trim().toUpperCase();
	const expiresAt = source?.expiresAt || source?.expires_at || null;
	const expiresAtMs = expiresAt ? Date.parse(String(expiresAt)) : Number.NaN;

	if (app !== ACCURA_QR_APP) {
		const error = new Error('This QR code is not an ACCURA login request.');
		error.status = 400;
		throw error;
	}
	if (
		challengeId !== expected.challengeId ||
		shortCode !== expected.shortCode
	) {
		const error = new Error('ACCURA login challenge details did not match the QR code.');
		error.status = 409;
		throw error;
	}
	if (['APPROVED', 'CONSUMED', 'CANCELLED'].includes(status)) {
		const error = new Error(`This ACCURA login request is already ${status.toLowerCase()}.`);
		error.status = 409;
		throw error;
	}
	if (status === 'EXPIRED' || (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now())) {
		const error = new Error(
			'This ACCURA login QR has expired. Please generate a new QR from ACCURA.',
		);
		error.status = 410;
		throw error;
	}

	return {
		app,
		challengeId,
		shortCode,
		status,
		expiresAt,
		expectedRolePrefix: normalizeAccuraRolePrefix(
			source?.expectedRolePrefix ||
				source?.rolePrefix ||
				source?.requiredRolePrefix ||
				'',
		),
		expectedSignaturaId: String(source?.expectedSignaturaId || '')
			.trim()
			.toUpperCase()
			.slice(0, 120),
		browser: String(
			source?.browser ||
				source?.browserName ||
				source?.device ||
				source?.userAgent ||
				'ACCURA browser',
		).slice(0, 160),
	};
}

async function fetchAccuraQrLoginChallenge({ challengeId, shortCode }) {
	const expected = {
		challengeId: normalizeChallengeId(challengeId),
		shortCode: normalizeShortCode(shortCode),
	};
	const endpoint = configuredEndpoint('ACCURA_QR_CHALLENGE_URL');
	endpoint.searchParams.set('challengeId', expected.challengeId);
	endpoint.searchParams.set('shortCode', expected.shortCode);
	endpoint.searchParams.set('app', ACCURA_QR_APP);
	const serviceAuth = qrServiceHeaders();

	const response = await fetch(endpoint, {
		method: 'GET',
		headers: serviceAuth.headers,
		cache: 'no-store',
		signal: AbortSignal.timeout(10_000),
	});
	let body;
	try {
		body = await readServiceResponse(
			response,
			'Unable to retrieve the ACCURA login request.',
		);
	} catch (error) {
		console.warn('[signatura.accura.qr_login.challenge.response]', {
			challengeId: expected.challengeId,
			target: endpoint.toString(),
			status: response.status,
			ok: response.ok,
			hasApprovalSecret: serviceAuth.hasApprovalSecret,
			sendingAuthorizationHeader: serviceAuth.sendingAuthorizationHeader,
			sendingApprovalSecretHeader: serviceAuth.sendingApprovalSecretHeader,
			body: String(error?.responseBody || '').slice(0, 2000),
		});
		throw error;
	}
	console.info('[signatura.accura.qr_login.challenge.response]', {
		challengeId: expected.challengeId,
		target: endpoint.toString(),
		status: response.status,
		ok: response.ok,
		hasApprovalSecret: serviceAuth.hasApprovalSecret,
		sendingAuthorizationHeader: serviceAuth.sendingAuthorizationHeader,
		sendingApprovalSecretHeader: serviceAuth.sendingApprovalSecretHeader,
	});
	return normalizeChallenge(body, expected);
}

async function postAccuraQrLoginApproval(payload) {
	const endpoint = configuredEndpoint('ACCURA_QR_APPROVE_URL');
	const serviceAuth = qrServiceHeaders();
	console.info('[signatura.accura.qr_login.approval.sending]', {
		challengeId: payload?.challengeId,
		target: endpoint.toString(),
		hasApprovalSecret: serviceAuth.hasApprovalSecret,
		sendingAuthorizationHeader: serviceAuth.sendingAuthorizationHeader,
		sendingApprovalSecretHeader: serviceAuth.sendingApprovalSecretHeader,
	});
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: serviceAuth.headers,
		body: JSON.stringify(payload),
		cache: 'no-store',
		signal: AbortSignal.timeout(10_000),
	});
	try {
		return await readServiceResponse(
			response,
			'ACCURA did not accept the login approval.',
		);
	} catch (error) {
		console.warn('[signatura.accura.qr_login.approval.response]', {
			challengeId: payload?.challengeId,
			target: endpoint.toString(),
			status: response.status,
			ok: response.ok,
			hasApprovalSecret: serviceAuth.hasApprovalSecret,
			sendingAuthorizationHeader: serviceAuth.sendingAuthorizationHeader,
			sendingApprovalSecretHeader: serviceAuth.sendingApprovalSecretHeader,
			body: String(error?.responseBody || '').slice(0, 2000),
		});
		throw error;
	}
}

export {
	accuraClientCredentials,
	fetchAccuraQrLoginChallenge,
	postAccuraQrLoginApproval,
};
