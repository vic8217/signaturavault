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

function evaluatePortalAccess({ pathname, search = '', role }) {
	if (pathname === '/issuer/activate' || pathname === '/issuer/onboarding') {
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

		return {
			action: 'redirect',
			destination: '/login',
			search: `?auth=required&next=${next}`,
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
