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

async function readServiceResponse(response, fallbackMessage) {
	const body = await response.json().catch(() => ({}));
	if (!response.ok) {
		const error = new Error(body?.error || fallbackMessage);
		error.status = response.status;
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

	const response = await fetch(endpoint, {
		method: 'GET',
		headers: serviceHeaders(),
		cache: 'no-store',
		signal: AbortSignal.timeout(10_000),
	});
	const body = await readServiceResponse(
		response,
		'Unable to retrieve the ACCURA login request.',
	);
	return normalizeChallenge(body, expected);
}

async function postAccuraQrLoginApproval(payload) {
	const endpoint = configuredEndpoint('ACCURA_QR_APPROVE_URL');
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: serviceHeaders(),
		body: JSON.stringify(payload),
		cache: 'no-store',
		signal: AbortSignal.timeout(10_000),
	});
	return readServiceResponse(
		response,
		'ACCURA did not accept the login approval.',
	);
}

export {
	accuraClientCredentials,
	fetchAccuraQrLoginChallenge,
	postAccuraQrLoginApproval,
};
