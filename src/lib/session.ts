import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const SESSION_COOKIE = 'signatura_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const REAUTH_TTL_MS = 5 * 60 * 1000;

type SessionPayload = {
	userId: string;
	email: string;
	createdAt: number;
	reauthenticatedAt?: number;
};

function getSessionSecret() {
	return (
		process.env.SESSION_SECRET ||
		process.env.AUTH_SECRET ||
		'development-only-session-secret-change-me'
	);
}

function base64url(input: Buffer | string) {
	return Buffer.from(input).toString('base64url');
}

function sign(value: string) {
	return crypto
		.createHmac('sha256', getSessionSecret())
		.update(value)
		.digest('base64url');
}

function encodeSession(payload: SessionPayload) {
	const body = base64url(JSON.stringify(payload));
	return `${body}.${sign(body)}`;
}

function decodeSession(token?: string | null): SessionPayload | null {
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
		return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
}

function isLocalRequest(req: Request) {
	const host = req.headers.get('host') || '';
	return host.startsWith('localhost') || host.startsWith('127.0.0.1');
}

function secureCookie(req: Request) {
	return !isLocalRequest(req);
}

async function getSession() {
	const cookieStore = await cookies();
	return decodeSession(cookieStore.get(SESSION_COOKIE)?.value);
}

async function requireSession() {
	const session = await getSession();
	if (!session?.userId) return null;
	return session;
}

function setSessionCookie(
	response: NextResponse,
	req: Request,
	payload: SessionPayload,
) {
	response.cookies.set(SESSION_COOKIE, encodeSession(payload), {
		httpOnly: true,
		secure: secureCookie(req),
		sameSite: 'lax',
		path: '/',
		maxAge: SESSION_TTL_SECONDS,
	});
}

function clearSessionCookie(response: NextResponse, req: Request) {
	response.cookies.set(SESSION_COOKIE, '', {
		httpOnly: true,
		secure: secureCookie(req),
		sameSite: 'lax',
		path: '/',
		maxAge: 0,
	});
}

function hasRecentVerification(session: SessionPayload | null) {
	return Boolean(
		session?.reauthenticatedAt &&
			Date.now() - session.reauthenticatedAt <= REAUTH_TTL_MS,
	);
}

function withReauthentication(session: SessionPayload) {
	return {
		...session,
		reauthenticatedAt: Date.now(),
	};
}

export {
	SESSION_COOKIE,
	SESSION_TTL_SECONDS,
	REAUTH_TTL_MS,
	clearSessionCookie,
	decodeSession,
	getSession,
	hasRecentVerification,
	requireSession,
	setSessionCookie,
	withReauthentication,
};
export type { SessionPayload };
