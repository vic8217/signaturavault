import { NextResponse } from 'next/server';
import {
	ROLE_COOKIE,
	ROLE_HOME,
	isKnownRole,
	roleCanAccessPath,
} from '@/lib/roles';

const PORTAL_PREFIXES = ['/wallet', '/issuer-portal', '/admin'];

function isPortalPath(pathname) {
	return PORTAL_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
}

function redirectTo(url, pathname, search = '') {
	const redirectUrl = new URL(pathname, url);
	redirectUrl.search = search;
	return NextResponse.redirect(redirectUrl);
}

export function proxy(request) {
	const { pathname } = request.nextUrl;

	if (pathname === '/issuer' || pathname.startsWith('/issuer/')) {
		return redirectTo(
			request.url,
			pathname.replace('/issuer', '/issuer-portal'),
			request.nextUrl.search,
		);
	}

	if (!isPortalPath(pathname)) {
		return NextResponse.next();
	}

	const role = request.cookies.get(ROLE_COOKIE)?.value;
	const next = encodeURIComponent(`${pathname}${request.nextUrl.search}`);

	if (!isKnownRole(role)) {
		return redirectTo(request.url, '/', `?auth=required&next=${next}`);
	}

	if (!roleCanAccessPath(role, pathname)) {
		return redirectTo(request.url, ROLE_HOME[role], '?auth=forbidden');
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		'/wallet/:path*',
		'/issuer-portal/:path*',
		'/admin/:path*',
		'/issuer/:path*',
	],
};
