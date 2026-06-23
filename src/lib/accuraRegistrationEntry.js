function normalizeHandoffToken(value) {
	return String(value || '').trim();
}

export function buildAccuraRegisterPath(handoffToken) {
	const token = normalizeHandoffToken(handoffToken);
	if (!token) return '';
	const params = new URLSearchParams({
		handoffToken: token,
		mode: 'register',
		source: 'accura',
		sourceApp: 'ACCURA',
	});
	return `/register/accura?${params.toString()}`;
}

export function buildAccuraMobileInstallPath(handoffToken) {
	const token = normalizeHandoffToken(handoffToken);
	if (!token) return '';
	const params = new URLSearchParams({
		handoffToken: token,
		source: 'accura',
		sourceApp: 'ACCURA',
	});
	return `/app?${params.toString()}`;
}

export function accuraHandoffFromSearchParams(params = {}) {
	const handoffToken = normalizeHandoffToken(
		params.handoffToken || params.token || params.registrationHandoff || '',
	);
	const source = String(params.source || params.sourceApp || '')
		.trim()
		.toLowerCase();
	if (!handoffToken || source !== 'accura') {
		return { handoffToken: '', registerPath: '', loginPath: '' };
	}
	const registerPath = buildAccuraRegisterPath(handoffToken);
	return {
		handoffToken,
		registerPath,
		loginPath: registerPath
			? `/login?next=${encodeURIComponent(registerPath)}`
			: '',
	};
}
