import { NextResponse } from 'next/server';
import { ROLE_COOKIE, ROLE_HOME, isKnownRole } from '@/lib/roles';

export async function POST(request) {
	if (process.env.NODE_ENV === 'production') {
		return NextResponse.json(
			{ error: 'Role switching is disabled in production' },
			{ status: 403 },
		);
	}

	const formData = await request.formData();
	const role = formData.get('role');

	if (!isKnownRole(role)) {
		return NextResponse.redirect(new URL('/?auth=invalid-role', request.url), 303);
	}

	const response = NextResponse.redirect(
		new URL(ROLE_HOME[role], request.url),
		303,
	);
	response.cookies.set(ROLE_COOKIE, role, {
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		path: '/',
		maxAge: 60 * 60 * 8,
	});

	return response;
}

export async function DELETE(request) {
	const response = NextResponse.redirect(new URL('/', request.url));
	response.cookies.delete(ROLE_COOKIE);
	return response;
}

export async function GET(request) {
	const response = NextResponse.redirect(new URL('/', request.url));
	response.cookies.delete(ROLE_COOKIE);
	return response;
}
