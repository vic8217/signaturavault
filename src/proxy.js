import { NextResponse } from 'next/server';
import { evaluatePortalAccess } from '@/lib/portalRoutes';
import { ROLE_COOKIE } from '@/lib/roles';
import { SESSION_COOKIE, decodeSession } from '@/lib/session-token';

function redirectTo(url, pathname, search = '') {
	const redirectUrl = new URL(pathname, url);
	redirectUrl.search = search;
	return NextResponse.redirect(redirectUrl);
}

function proxy(request) {
	const { pathname, search } = request.nextUrl;
	const role =
		request.cookies.get(ROLE_COOKIE)?.value ||
		decodeSession(request.cookies.get(SESSION_COOKIE)?.value)?.role;
	const decision = evaluatePortalAccess({ pathname, search, role });

	if (decision.action === 'allow') {
		return NextResponse.next();
	}

	return redirectTo(request.url, decision.destination, decision.search);
}

export { proxy };

export const config = {
	matcher: [
		'/signatura/:path*',
		'/wallet/:path*',
		'/issuer/:path*',
		'/issuer-portal/:path*',
		'/admin/:path*',
	],
};

export default proxy;
