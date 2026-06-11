const ROLES = {
	DOCUMENT_OWNER: 'DOCUMENT_OWNER',
	ISSUER_ADMIN: 'ISSUER_ADMIN',
	ISSUER_STAFF: 'ISSUER_STAFF',
	SIGNATURA_ADMIN: 'SIGNATURA_ADMIN',
	SIGNATURA_STAFF: 'SIGNATURA_STAFF',
};

const ROLE_COOKIE = 'signatura_role';

const PORTAL_ACCESS = {
	'/signatura': [ROLES.DOCUMENT_OWNER],
	'/wallet': [ROLES.DOCUMENT_OWNER],
	'/issuer': [ROLES.ISSUER_ADMIN, ROLES.ISSUER_STAFF],
	'/issuer-portal': [ROLES.ISSUER_ADMIN, ROLES.ISSUER_STAFF],
	'/admin': [ROLES.SIGNATURA_ADMIN, ROLES.SIGNATURA_STAFF],
};

const ROLE_HOME = {
	[ROLES.DOCUMENT_OWNER]: '/signatura/dashboard',
	[ROLES.ISSUER_ADMIN]: '/issuer',
	[ROLES.ISSUER_STAFF]: '/issuer',
	[ROLES.SIGNATURA_ADMIN]: '/admin',
	[ROLES.SIGNATURA_STAFF]: '/admin',
};

const DOCUMENT_OWNER_PREFIXES = ['/signatura', '/wallet'];
const ISSUER_PREFIXES = ['/issuer', '/issuer-portal'];

function isKnownRole(role) {
	return Object.values(ROLES).includes(role);
}

function matchesPortalPrefix(pathname, prefix) {
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function roleCanAccessPath(role, pathname) {
	const portal = Object.keys(PORTAL_ACCESS)
		.sort((a, b) => b.length - a.length)
		.find((path) => matchesPortalPrefix(pathname, path));

	if (!portal) {
		return true;
	}

	return PORTAL_ACCESS[portal].includes(role);
}

function isDocumentOwnerPath(pathname) {
	return DOCUMENT_OWNER_PREFIXES.some((prefix) =>
		matchesPortalPrefix(pathname, prefix),
	);
}

function isIssuerPortalPath(pathname) {
	return ISSUER_PREFIXES.some((prefix) => matchesPortalPrefix(pathname, prefix));
}

export {
	DOCUMENT_OWNER_PREFIXES,
	ISSUER_PREFIXES,
	ROLE_COOKIE,
	ROLE_HOME,
	ROLES,
	isDocumentOwnerPath,
	isIssuerPortalPath,
	isKnownRole,
	matchesPortalPrefix,
	roleCanAccessPath,
};
