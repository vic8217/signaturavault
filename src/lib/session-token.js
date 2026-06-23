import crypto from 'crypto';

const SESSION_COOKIE = 'signatura_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const REAUTH_TTL_MS = 5 * 60 * 1000;

function getSessionSecret() {
	return (
		process.env.SESSION_SECRET ||
		process.env.AUTH_SECRET ||
		'development-only-session-secret-change-me'
	);
}

function base64url(input) {
	return Buffer.from(input).toString('base64url');
}

function sign(value) {
	return crypto
		.createHmac('sha256', getSessionSecret())
		.update(value)
		.digest('base64url');
}

function encodeSession(payload) {
	const body = base64url(JSON.stringify(payload));
	return `${body}.${sign(body)}`;
}

function decodeSession(token) {
	if (!token) return null;

	const [body, signature] = token.split('.');
	if (!body || !signature) return null;

	const expected = sign(body);
	const actualBuffer = Buffer.from(signature);
	const expectedBuffer = Buffer.from(expected);

	if (
		actualBuffer.length !== expectedBuffer.length ||
		!crypto.timingSafeEqual(actualBuffer, expectedBuffer)
	) {
		return null;
	}

	try {
		const payload = JSON.parse(
			Buffer.from(body, 'base64url').toString('utf8'),
		);
		if (payload.exp && Date.now() > payload.exp) return null;
		return payload;
	} catch {
		return null;
	}
}

export {
	REAUTH_TTL_MS,
	SESSION_COOKIE,
	SESSION_TTL_SECONDS,
	decodeSession,
	encodeSession,
};
