function isLocalHost(host = '') {
	const hostname = String(host).split(':')[0].trim().toLowerCase();
	return (
		hostname === 'localhost' ||
		hostname === '127.0.0.1' ||
		hostname === '[::1]' ||
		hostname === '0.0.0.0'
	);
}

function isPrivateLanHost(host = '') {
	const hostname = String(host).split(':')[0].trim().toLowerCase();
	return (
		/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
		/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
		/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
	);
}

function isPhoneUnreachableHost(host = '') {
	const hostname = String(host).split(':')[0].trim().toLowerCase();
	if (!hostname) return true;
	return isLocalHost(hostname) || isPrivateLanHost(hostname);
}

function configuredPublicSignaturaOrigin() {
	const candidates = [
		process.env.SIGNATURA_PUBLIC_URL,
		process.env.NEXT_PUBLIC_SIGNATURA_PUBLIC_URL,
		process.env.NEXT_PUBLIC_SIGNATURA_URL,
	];
	for (const value of candidates) {
		const raw = String(value || '').trim();
		if (!raw) continue;
		try {
			const url = raw.startsWith('http')
				? new URL(raw)
				: new URL(`https://${raw}`);
			return url.origin;
		} catch {
			continue;
		}
	}
	return '';
}

function getRequestHost(req: Request) {
	return req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
}

function getRequestOrigin(req: Request) {
	const host = getRequestHost(req);
	const forwardedProto = req.headers.get('x-forwarded-proto');
	const proto = forwardedProto || (isLocalHost(host) ? 'http' : 'https');
	return `${proto}://${host}`;
}

function normalizePublicOrigin(origin: string) {
	try {
		const url = new URL(origin);
		if (
			url.hostname.endsWith('.ngrok-free.dev') ||
			url.hostname.endsWith('.ngrok-free.app')
		) {
			url.protocol = 'https:';
		}
		return url.origin;
	} catch {
		return origin;
	}
}

function resolvePublicSignaturaOrigin(req: Request) {
	const requestOrigin = getRequestOrigin(req);
	const host = getRequestHost(req);
	const configured = configuredPublicSignaturaOrigin();
	if (!isPhoneUnreachableHost(host)) {
		return normalizePublicOrigin(requestOrigin);
	}
	if (configured) {
		return normalizePublicOrigin(configured);
	}
	return requestOrigin;
}

function assertPhoneReachableSignaturaOrigin(req: Request) {
	const origin = resolvePublicSignaturaOrigin(req);
	let hostname = '';
	try {
		hostname = new URL(origin).hostname;
	} catch {
		hostname = '';
	}
	if (isPhoneUnreachableHost(hostname)) {
		const error = new Error(
			'Phone QR codes cannot use localhost or LAN-only addresses. Set SIGNATURA_PUBLIC_URL to your phone-reachable HTTPS URL (for example your ngrok URL), then open Signatura through that same URL on desktop.',
		);
		(error as Error & { status?: number }).status = 503;
		throw error;
	}
	return origin;
}

function isLocalhostQrUrl(url = '') {
	try {
		return isLocalHost(new URL(url).hostname);
	} catch {
		return /localhost|127\.0\.0\.1/i.test(String(url));
	}
}

export {
	assertPhoneReachableSignaturaOrigin,
	configuredPublicSignaturaOrigin,
	getRequestOrigin,
	isLocalhostQrUrl,
	resolvePublicSignaturaOrigin,
};
