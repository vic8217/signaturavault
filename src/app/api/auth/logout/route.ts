import { NextResponse } from 'next/server';
import { resolvePublicSignaturaOrigin } from '@/lib/publicOrigin';
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

export async function GET(req: Request) {
	const session = await getSession();
	const url = new URL(req.url);
	const redirectTo = safeRedirectTarget(url.searchParams.get('redirect') || '/login', req);
	const response = NextResponse.redirect(
		new URL(redirectTo, `${resolvePublicSignaturaOrigin(req)}/`),
	);
	if (session?.userId) {
		await logSecurityEvent(req, 'session_logged_out', session.userId, {
			reason: 'logout_redirect',
		});
	}
	clearSessionCookie(response, req);
	return response;
}

export async function POST(req: Request) {
	const session = await getSession();
	if (session?.userId) {
		await logSecurityEvent(req, 'session_logged_out', session.userId);
	}

	const response = NextResponse.json({ ok: true });
	clearSessionCookie(response, req);
	return response;
}
