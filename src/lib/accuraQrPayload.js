const ACCURA_QR_APP = 'ACCURA';
const FORBIDDEN_QR_KEYS = new Set([
	'privatekey',
	'recoveryphrase',
	'recoverycode',
	'seedphrase',
	'mnemonic',
	'passkeycredential',
	'credentialsecret',
	'permanentauthtoken',
	'sessiontoken',
	'accesstoken',
	'refreshtoken',
	'authtoken',
	'token',
]);

function normalizeQrKey(value) {
	return String(value || '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

function normalizeChallengeId(value) {
	return String(value || '').trim().slice(0, 200);
}

function normalizeShortCode(value) {
	return String(value || '')
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9-]/g, '')
		.slice(0, 32);
}

function parseAccuraLoginQr(payload) {
	const raw = String(payload || '').trim();
	if (!raw) {
		return { valid: false, reason: 'missing_payload', error: 'QR code is empty.' };
	}
	const normalizedPayload = normalizeQrKey(raw);
	if (
		[
			'privatekey',
			'recoveryphrase',
			'seedphrase',
			'passkeycredential',
			'permanentauthtoken',
		].some((marker) => normalizedPayload.includes(marker))
	) {
		return {
			valid: false,
			reason: 'sensitive_payload',
			error: 'This QR code contains data that is not allowed in a login request.',
		};
	}

	let url;
	try {
		url = new URL(raw);
	} catch {
		return {
			valid: false,
			reason: 'invalid_format',
			error: 'This QR code is not an ACCURA login request.',
		};
	}

	for (const [key] of url.searchParams.entries()) {
		if (FORBIDDEN_QR_KEYS.has(normalizeQrKey(key))) {
			return {
				valid: false,
				reason: 'sensitive_payload',
				error: 'This QR code contains data that is not allowed in a login request.',
			};
		}
	}

	const app = String(url.searchParams.get('app') || '').trim().toUpperCase();
	if (app !== ACCURA_QR_APP) {
		return {
			valid: false,
			reason: 'wrong_app',
			error: 'This QR code is not an ACCURA login request.',
		};
	}

	const isCustomScheme =
		url.protocol === 'signatura:' &&
		url.hostname.toLowerCase() === 'login' &&
		url.pathname.replace(/\/+$/, '').toLowerCase() === '/accura';
	const isHttpsFallback =
		url.protocol === 'https:' &&
		url.pathname.replace(/\/+$/, '').toLowerCase() === '/wallet/scan-login';
	if (!isCustomScheme && !isHttpsFallback) {
		return {
			valid: false,
			reason: 'invalid_route',
			error: 'This QR code is not an ACCURA login request.',
		};
	}

	const challengeId = normalizeChallengeId(url.searchParams.get('challengeId'));
	const shortCode = normalizeShortCode(url.searchParams.get('shortCode'));
	if (!challengeId) {
		return {
			valid: false,
			reason: 'missing_challenge',
			error: 'ACCURA login QR is missing its challenge ID.',
		};
	}
	if (!shortCode) {
		return {
			valid: false,
			reason: 'missing_short_code',
			error: 'ACCURA login QR is missing its short code.',
		};
	}

	return {
		valid: true,
		app: ACCURA_QR_APP,
		challengeId,
		shortCode,
	};
}

function buildAccuraQrApprovalPath({ challengeId, shortCode }) {
	const params = new URLSearchParams({
		challengeId: normalizeChallengeId(challengeId),
		shortCode: normalizeShortCode(shortCode),
	});
	return `/signatura/approve-accura-login?${params.toString()}`;
}

function parseAccuraRegistrationQr(payload) {
	const raw = String(payload || '').trim();
	if (!raw) {
		return { valid: false, reason: 'missing_payload', error: 'QR code is empty.' };
	}

	let url;
	try {
		url = new URL(raw);
	} catch {
		return {
			valid: false,
			reason: 'invalid_format',
			error: 'This QR code is not an ACCURA registration link.',
		};
	}

	for (const [key] of url.searchParams.entries()) {
		if (FORBIDDEN_QR_KEYS.has(normalizeQrKey(key))) {
			return {
				valid: false,
				reason: 'sensitive_payload',
				error: 'This QR code contains data that is not allowed in a registration link.',
			};
		}
	}

	const path = url.pathname.replace(/\/+$/, '').toLowerCase();
	const handoffToken = String(url.searchParams.get('handoffToken') || '').trim();
	const source = String(url.searchParams.get('source') || url.searchParams.get('sourceApp') || '')
		.trim()
		.toLowerCase();
	if (path.endsWith('/app') && handoffToken && source === 'accura') {
		return {
			valid: true,
			handoffToken,
			href: `/app?${url.searchParams.toString()}`,
		};
	}
	if (!path.endsWith('/register/accura')) {
		return {
			valid: false,
			reason: 'invalid_route',
			error: 'This QR code is not an ACCURA registration link.',
		};
	}

	if (!handoffToken) {
		return {
			valid: false,
			reason: 'missing_handoff',
			error: 'ACCURA registration QR is missing its secure handoff token.',
		};
	}

	return {
		valid: true,
		handoffToken,
		href: `${url.pathname}${url.search}`,
	};
}

export {
	ACCURA_QR_APP,
	buildAccuraQrApprovalPath,
	normalizeChallengeId,
	normalizeShortCode,
	parseAccuraLoginQr,
	parseAccuraRegistrationQr,
};
