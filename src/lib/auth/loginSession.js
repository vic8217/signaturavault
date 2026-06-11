import { NextResponse } from 'next/server';
import { logAuthAudit } from '@/lib/auth/authAudit';
import { userPublicIdentity } from '@/lib/identity';
import { prisma } from '@/lib/prisma';
import { normalizeLoginNextPath } from '@/lib/portalRoutes';
import {
	ROLE_COOKIE,
	ROLES,
	isDocumentOwnerPath,
	isIssuerPortalPath,
} from '@/lib/roles';
import { setSessionCookie } from '@/lib/session';

async function resolvePortalRole(userId, nextPath) {
	let portalRole = null;
	if (isIssuerPortalPath(nextPath)) {
		const issuerUser = await prisma.issuerUser.findFirst({
			where: { userId, status: 'active' },
			orderBy: { activatedAt: 'desc' },
		});
		if (!issuerUser) {
			const error = new Error(
				'This account is not activated as an issuer. Open the issuer activation invite from Dev Admin first.',
			);
			error.status = 403;
			throw error;
		}
		portalRole =
			issuerUser.role === ROLES.ISSUER_ADMIN
				? ROLES.ISSUER_ADMIN
				: ROLES.ISSUER_STAFF;
	} else if (isDocumentOwnerPath(nextPath)) {
		portalRole = ROLES.DOCUMENT_OWNER;
	} else if (nextPath.startsWith('/hoa-key/')) {
		const issuerUser = await prisma.issuerUser.findFirst({
			where: { userId, status: 'active' },
			orderBy: { activatedAt: 'desc' },
		});
		portalRole = issuerUser
			? issuerUser.role === ROLES.ISSUER_ADMIN
				? ROLES.ISSUER_ADMIN
				: ROLES.ISSUER_STAFF
			: ROLES.DOCUMENT_OWNER;
	}
	return portalRole;
}

async function createAuthenticatedLoginResponse({
	req,
	user,
	nextPath,
	eventName,
	eventDetails = {},
}) {
	const allowedNext = normalizeLoginNextPath(
		nextPath?.startsWith('/') ? nextPath : '/signatura/dashboard',
	);
	const portalRole = await resolvePortalRole(user.id, allowedNext);

	await logAuthAudit(req, eventName, {
		userId: user.id,
		details: eventDetails,
	});

	const responseJson = NextResponse.json({
		ok: true,
		next: allowedNext,
		user: userPublicIdentity(user),
		canRegisterDevice: true,
	});
	setSessionCookie(responseJson, req, {
		userId: user.id,
		signaturaId: user.signaturaId,
		role: portalRole,
		trustLevel: user.trustLevel,
		iat: Date.now(),
		createdAt: Date.now(),
		reauthenticatedAt: Date.now(),
	});
	if (portalRole) {
		responseJson.cookies.set(ROLE_COOKIE, portalRole, {
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			path: '/',
			maxAge: 60 * 60 * 8,
		});
	}
	return responseJson;
}

export { createAuthenticatedLoginResponse, resolvePortalRole };
