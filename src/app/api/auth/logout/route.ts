import { NextResponse } from 'next/server';
import { clearSessionCookie, getSession } from '@/lib/session';
import { logSecurityEvent } from '@/lib/webauthn';

export async function POST(req: Request) {
	const session = await getSession();
	if (session?.userId) {
		await logSecurityEvent(req, 'session_logged_out', session.userId);
	}

	const response = NextResponse.json({ ok: true });
	clearSessionCookie(response, req);
	return response;
}
