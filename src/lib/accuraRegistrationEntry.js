function normalizeHandoffToken(value) {
	return String(value || '').trim();
}

function normalizeParam(value) {
	return String(value || '').trim();
}

function accuraHandoffExtras(params = {}) {
	const challengeId = normalizeParam(
		params.challengeId || params.cid || params.handoffId || '',
	);
	const extras = {};
	if (challengeId) extras.challengeId = challengeId;

	for (const key of ['handoffId', 'flowType', 'originDevice', 'returnUrl']) {
		const value = normalizeParam(params[key]);
		if (value) extras[key] = value;
	}

	const app = normalizeParam(params.app);
	if (app) extras.app = app;

	return extras;
}

export function buildAccuraRegisterPath(handoffToken, params = {}) {
	const token = normalizeHandoffToken(handoffToken);
	if (!token) return '';
	const search = new URLSearchParams({
		handoffToken: token,
		mode: 'register',
		source: 'accura',
		sourceApp: 'ACCURA',
		...accuraHandoffExtras(params),
	});
	return `/register/accura?${search.toString()}`;
}

export function buildAccuraMobileInstallPath(handoffToken, params = {}) {
	const token = normalizeHandoffToken(handoffToken);
	if (!token) return '';
	const search = new URLSearchParams({
		handoffToken: token,
		source: 'accura',
		sourceApp: 'ACCURA',
		...accuraHandoffExtras(params),
	});
	return `/app?${search.toString()}`;
}

export function accuraHandoffFromSearchParams(params = {}) {
	const handoffToken = normalizeHandoffToken(
		params.handoffToken || params.token || params.registrationHandoff || '',
	);
	const source = String(params.source || params.sourceApp || '')
		.trim()
		.toLowerCase();
	const app = String(params.app || '').trim().toUpperCase();
	if (!handoffToken || (source !== 'accura' && app !== 'ACCURA')) {
		return { handoffToken: '', registerPath: '', loginPath: '' };
	}
	const registerPath = buildAccuraRegisterPath(handoffToken, params);
	return {
		handoffToken,
		registerPath,
		loginPath: registerPath
			? `/login?next=${encodeURIComponent(registerPath)}`
			: '',
	};
}
