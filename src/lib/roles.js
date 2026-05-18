const ROLES = {
	DOCUMENT_OWNER: 'DOCUMENT_OWNER',
	ISSUER_ADMIN: 'ISSUER_ADMIN',
	ISSUER_STAFF: 'ISSUER_STAFF',
	SIGNATURA_ADMIN: 'SIGNATURA_ADMIN',
	SIGNATURA_STAFF: 'SIGNATURA_STAFF',
};

const ROLE_COOKIE = 'signatura_role';

const PORTAL_ACCESS = {
	'/wallet': [ROLES.DOCUMENT_OWNER],
	'/issuer-portal': [ROLES.ISSUER_ADMIN, ROLES.ISSUER_STAFF],
	'/admin': [ROLES.SIGNATURA_ADMIN, ROLES.SIGNATURA_STAFF],
};

const ROLE_HOME = {
	[ROLES.DOCUMENT_OWNER]: '/wallet',
	[ROLES.ISSUER_ADMIN]: '/issuer-portal',
	[ROLES.ISSUER_STAFF]: '/issuer-portal',
	[ROLES.SIGNATURA_ADMIN]: '/admin',
	[ROLES.SIGNATURA_STAFF]: '/admin',
};

function isKnownRole(role) {
	return Object.values(ROLES).includes(role);
}

function roleCanAccessPath(role, pathname) {
	const portal = Object.keys(PORTAL_ACCESS).find(
		(path) => pathname === path || pathname.startsWith(`${path}/`),
	);

	if (!portal) {
		return true;
	}

	return PORTAL_ACCESS[portal].includes(role);
}

export { ROLE_COOKIE, ROLE_HOME, ROLES, isKnownRole, roleCanAccessPath };
