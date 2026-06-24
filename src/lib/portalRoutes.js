import {
	ROLE_HOME,
	isKnownRole,
	roleCanAccessPath,
} from './roles.js';
import {
	isLegacyRedirectPath,
	isPortalPath,
	normalizeLoginNextPath,
} from './portalRoutesCore.js';

export * from './portalRoutesCore.js';

function evaluatePortalAccess({
	pathname,
	search = '',
	role,
	nodeEnv = process.env.NODE_ENV,
}) {
	if (
		pathname === '/issuer/activate' ||
		pathname === '/issuer/onboarding' ||
		pathname === '/signatura/register' ||
		pathname === '/admin/login' ||
		pathname === '/admin/register'
	) {
		return { action: 'allow' };
	}

	if (!isPortalPath(pathname)) {
		return { action: 'allow' };
	}

	if (!isKnownRole(role)) {
		if (isLegacyRedirectPath(pathname)) {
			return { action: 'allow' };
		}

		const next = encodeURIComponent(
			normalizeLoginNextPath(`${pathname}${search}`),
		);
		const isAdminEntry = pathname === '/admin' || pathname.startsWith('/admin/');

		return {
			action: 'redirect',
			destination: isAdminEntry ? '/admin/login' : '/login',
			search: isAdminEntry ? `?next=${next}` : `?auth=required&next=${next}`,
		};
	}

	if (!roleCanAccessPath(role, pathname)) {
		return {
			action: 'redirect',
			destination: ROLE_HOME[role],
			search: '?auth=forbidden',
		};
	}

	return { action: 'allow' };
}

export { evaluatePortalAccess };
