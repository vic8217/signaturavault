function csvValues(value) {
	return String(value || '')
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function urlOrigin(value) {
	try {
		return new URL(value).origin;
	} catch {
		return '';
	}
}

function configuredAllowedOrigins() {
	const origins = [
		...csvValues(process.env.SIGNATURA_ALLOWED_RETURN_ORIGINS),
		...csvValues(process.env.ACCURA_ALLOWED_ORIGINS),
		process.env.ACCURA_ORIGIN,
		process.env.NEXT_PUBLIC_ACCURA_ORIGIN,
		process.env.HAVENXSIG_ORIGIN,
	];

	for (const callbackUrl of [
		...csvValues(process.env.SIGNATURA_ALLOWED_RETURN_URLS),
		...csvValues(process.env.ACCURA_CALLBACK_URLS),
		process.env.ACCURA_CALLBACK_URL,
		process.env.NEXT_PUBLIC_ACCURA_CALLBACK_URL,
		process.env.HAVENXSIG_CALLBACK_URL,
	]) {
		const origin = urlOrigin(callbackUrl);
		if (origin) origins.push(origin);
	}

	if (process.env.NODE_ENV !== 'production') {
		origins.push('http://localhost:3001', 'http://127.0.0.1:3001');
	}

	return new Set(origins.filter(Boolean));
}

function configuredAllowedUrls() {
	const urls = [
		...csvValues(process.env.SIGNATURA_ALLOWED_RETURN_URLS),
		...csvValues(process.env.ACCURA_CALLBACK_URLS),
		process.env.ACCURA_CALLBACK_URL,
		process.env.NEXT_PUBLIC_ACCURA_CALLBACK_URL,
		process.env.HAVENXSIG_CALLBACK_URL,
	];

	if (process.env.NODE_ENV === 'production') {
		urls.push('https://havenxsig.com/auth/callback');
	}

	return new Set(urls.filter(Boolean));
}

function isPrivateLanHostname(hostname) {
	return (
		/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
		/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
		/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
	);
}

function isDevelopmentPartnerUrl(url) {
	if (process.env.NODE_ENV === 'production') return false;
	if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return true;
	return isPrivateLanHostname(url.hostname);
}

function isPhoneUnreachableAccuraHost(hostname = '') {
	const normalized = String(hostname).split(':')[0].trim().toLowerCase();
	if (!normalized) return true;
	return (
		normalized === 'localhost' ||
		normalized === '127.0.0.1' ||
		normalized === '[::1]' ||
		normalized === '0.0.0.0' ||
		isPrivateLanHostname(normalized)
	);
}

function isPhoneUnreachableAccuraReturnUrl(value = '') {
	try {
		return isPhoneUnreachableAccuraHost(new URL(String(value || '')).hostname);
	} catch {
		return false;
	}
}

function normalizeExternalReturnUrl(value) {
	const raw = String(value || '').trim();
	if (!raw) return '';

	let parsed;
	try {
		parsed = new URL(raw);
	} catch {
		return '';
	}

	if (!['https:', 'http:'].includes(parsed.protocol)) return '';
	if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
		return '';
	}

	const normalized = parsed.toString();
	if (configuredAllowedUrls().has(normalized)) return normalized;
	if (configuredAllowedOrigins().has(parsed.origin)) return normalized;
	if (isDevelopmentPartnerUrl(parsed)) return normalized;
	return '';
}

function externalReturnUrlFromParams(params = {}) {
	const candidates = [
		params.returnUrl,
		params.return_url,
		params.appReturnUrl,
		params.app_return_url,
		params.callbackUrl,
		params.callback_url,
		params.redirectUrl,
		params.redirect_url,
		params.redirect_uri,
		params.continue,
		params.from,
		params.next,
	];

	for (const candidate of candidates) {
		if (typeof candidate !== 'string') continue;
		const normalized = normalizeExternalReturnUrl(candidate);
		if (normalized) return normalized;
	}

	return '';
}

export {
	externalReturnUrlFromParams,
	isPhoneUnreachableAccuraHost,
	isPhoneUnreachableAccuraReturnUrl,
	normalizeExternalReturnUrl,
};
