import { NextResponse } from 'next/server';
import { logAuthAudit } from '@/lib/auth/authAudit';
import {
	SIGNATURA_ACCOUNT_TYPES,
	getSignaturaAccountType,
	userPublicIdentity,
} from '@/lib/identity';
import { prisma } from '@/lib/prisma';
import { normalizeLoginNextPath } from '@/lib/portalRoutes';
import {
	ROLE_COOKIE,
	ROLES,
	isDocumentOwnerPath,
	isIssuerPortalPath,
} from '@/lib/roles';
import { setSessionCookie } from '@/lib/session';
import {
	APPLICATION_CODES,
	UNIVERSAL_ROLE_CODES,
	getIdentityContexts,
	identityHasUniversalRole,
} from '@/lib/universalIdentity';

function isIssuerActivationInvitePath(nextPath) {
	try {
		const parsed = new URL(nextPath, 'https://signatura.local');
		return parsed.pathname === '/issuer/activate' && parsed.searchParams.has('token');
	} catch {
		return false;
	}
}

async function resolvePortalRole(userId, nextPath) {
	let portalRole = null;
	if (isIssuerActivationInvitePath(nextPath)) {
		return null;
	}
	if (isIssuerPortalPath(nextPath)) {
		if (
			await identityHasUniversalRole(userId, {
				applicationCode: APPLICATION_CODES.SIGNATURA,
				roleCodes: [
					UNIVERSAL_ROLE_CODES.ISSUER_ADMIN,
					UNIVERSAL_ROLE_CODES.ISSUER_STAFF,
				],
				organizationId: undefined,
			})
		) {
			const isIssuerAdmin = await identityHasUniversalRole(userId, {
				applicationCode: APPLICATION_CODES.SIGNATURA,
				roleCodes: [UNIVERSAL_ROLE_CODES.ISSUER_ADMIN],
				organizationId: undefined,
			});
			return isIssuerAdmin ? ROLES.ISSUER_ADMIN : ROLES.ISSUER_STAFF;
		}
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { signaturaId: true },
		});
		const accountType = getSignaturaAccountType(user?.signaturaId);
		const issuerUser = await prisma.issuerUser.findFirst({
			where: { userId, status: 'active' },
			orderBy: { activatedAt: 'desc' },
		});
		if (!issuerUser) {
			if (
				accountType === SIGNATURA_ACCOUNT_TYPES.ISSUER &&
				process.env.NODE_ENV !== 'production'
			) {
				return ROLES.ISSUER_ADMIN;
			}
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
	} else if (nextPath.startsWith('/admin')) {
		if (
			await identityHasUniversalRole(userId, {
				applicationCode: APPLICATION_CODES.SIGNATURA,
				roleCodes: [
					UNIVERSAL_ROLE_CODES.SIGNATURA_SYSTEM_ADMIN,
					UNIVERSAL_ROLE_CODES.SIGNATURA_STAFF,
				],
				organizationId: null,
			})
		) {
			const isSystemAdmin = await identityHasUniversalRole(userId, {
				applicationCode: APPLICATION_CODES.SIGNATURA,
				roleCodes: [UNIVERSAL_ROLE_CODES.SIGNATURA_SYSTEM_ADMIN],
				organizationId: null,
			});
			return isSystemAdmin ? ROLES.SIGNATURA_ADMIN : ROLES.SIGNATURA_STAFF;
		}
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { signaturaId: true },
		});
		const accountType = getSignaturaAccountType(user?.signaturaId);
		if (accountType === SIGNATURA_ACCOUNT_TYPES.ADMIN) {
			portalRole = ROLES.SIGNATURA_ADMIN;
		} else {
			const error = new Error('This Signatura ID is not provisioned for admin access.');
			error.status = 403;
			throw error;
		}
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
	canRegisterDevice = false,
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
		contexts: await getIdentityContexts(user.id),
		canRegisterDevice,
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
