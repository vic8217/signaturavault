import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
	REAUTH_TTL_MS,
	SESSION_COOKIE,
	SESSION_TTL_SECONDS,
	decodeSession,
	encodeSession,
} from '@/lib/session-token';

type SessionPayload = {
	userId: string;
	signaturaId: string;
	role?: string | null;
	trustLevel?: number;
	iat?: number;
	exp?: number;
	createdAt?: number;
	reauthenticatedAt?: number;
};

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

	const user = await prisma.user.findUnique({
		where: { id: session.userId },
		select: {
			id: true,
			signaturaId: true,
			accountStatus: true,
			trustLevel: true,
		},
	});

	if (!user) return null;
	return {
		...session,
		signaturaId: user.signaturaId,
		accountStatus: user.accountStatus,
		trustLevel: user.trustLevel,
	};
}

function setSessionCookie(
	response: NextResponse,
	req: Request,
	payload: SessionPayload,
) {
	const issuedAt = payload.iat || Date.now();
	const expiresAt = payload.exp || issuedAt + SESSION_TTL_SECONDS * 1000;
	const safePayload = {
		userId: payload.userId,
		signaturaId: payload.signaturaId,
		role: payload.role || null,
		trustLevel: payload.trustLevel || 1,
		iat: issuedAt,
		exp: expiresAt,
		createdAt: payload.createdAt || issuedAt,
		reauthenticatedAt: payload.reauthenticatedAt,
	};
	response.cookies.set(SESSION_COOKIE, encodeSession(safePayload), {
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
