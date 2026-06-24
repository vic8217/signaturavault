import { NextResponse } from 'next/server';
import { ROLE_COOKIE } from '@/lib/roles';
import { clearSessionCookie, getSession } from '@/lib/session';
import { logSecurityEvent } from '@/lib/webauthn';

function safeRedirectTarget(value: string, req: Request) {
	const raw = String(value || '').trim();
	if (!raw.startsWith('/')) return '/login';
	try {
		const destination = new URL(raw, req.url);
		const origin = new URL(req.url).origin;
		if (destination.origin !== origin) return '/login';
		return `${destination.pathname}${destination.search}`;
	} catch {
		return '/login';
	}
}

async function tryGetSession() {
	try {
		return await getSession();
	} catch {
		return null;
	}
}

async function tryLogLogout(req: Request, userId?: string, details = {}) {
	if (!userId) return;
	try {
		await logSecurityEvent(req, 'session_logged_out', userId, details);
	} catch {
		// Logout should still clear cookies and redirect if audit logging is unavailable.
	}
}

function clearAuthCookies(response: NextResponse, req: Request) {
	clearSessionCookie(response, req);
	response.cookies.set(ROLE_COOKIE, '', {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax',
		path: '/',
		maxAge: 0,
	});
}

export async function GET(req: Request) {
	const session = await tryGetSession();
	const url = new URL(req.url);
	const redirectTo = safeRedirectTarget(url.searchParams.get('redirect') || '/login', req);
	const response = NextResponse.redirect(new URL(redirectTo, req.url));
	await tryLogLogout(req, session?.userId, { reason: 'logout_redirect' });
	clearAuthCookies(response, req);
	return response;
}

export async function POST(req: Request) {
	const session = await tryGetSession();
	await tryLogLogout(req, session?.userId);

	const response = NextResponse.json({ ok: true });
	clearAuthCookies(response, req);
	return response;
}
