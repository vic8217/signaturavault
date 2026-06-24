const PUBLIC_ROUTES = [
	'/',
	'/issuers',
	'/users',
	'/document-owners',
	'/security',
	'/use-cases',
	'/contact',
	'/pricing',
	'/login',
	'/login/authorize',
	'/register',
	'/signatura/register',
	'/admin/login',
	'/admin/register',
	'/verify',
	'/account-recovery',
	'/consent',
];

const PORTAL_PREFIXES = [
	'/owner',
	'/signatura',
	'/wallet',
	'/issuer',
	'/issuer-portal',
	'/admin',
];

const LEGACY_REDIRECT_PREFIXES = ['/wallet', '/security', '/issuer-portal'];

const LEGACY_REDIRECTS = [
	{ source: '/issuer-portal', destination: '/issuer' },
	{ source: '/issuer-portal/:path*', destination: '/issuer/:path*' },
	{ source: '/wallet', destination: '/signatura/dashboard' },
	{ source: '/wallet/credentials', destination: '/signatura/documents' },
	{ source: '/wallet/issuers', destination: '/signatura/documents/issuers' },
	{
		source: '/wallet/issuers/:type',
		destination: '/signatura/documents/issuers/:type',
	},
	{
		source: '/wallet/issuers/issuer/:issuerId',
		destination: '/signatura/documents/issuers/issuer/:issuerId',
	},
	{ source: '/wallet/scan', destination: '/signatura/documents/scan' },
	{ source: '/wallet/scan-login', destination: '/signatura/scan-login' },
	{
		source: '/wallet/approve-accura-login',
		destination: '/signatura/approve-accura-login',
	},
	{ source: '/wallet/settings', destination: '/signatura/settings' },
	{
		source: '/wallet/profile',
		destination: '/signatura/settings/security',
	},
	{ source: '/wallet/:path*', destination: '/signatura/dashboard' },
	{ source: '/security/devices', destination: '/signatura/trusted-devices' },
	{
		source: '/security/add-device',
		destination: '/signatura/trusted-devices/add',
	},
	{
		source: '/security/add-passkey',
		destination: '/signatura/trusted-devices/add-passkey',
	},
	{
		source: '/security/recovery-codes',
		destination: '/signatura/settings/recovery-codes',
	},
	{ source: '/document-owners', destination: '/users' },
];

const EXACT_LEGACY_NEXT_MAP = {
	'/owner': '/owner',
	'/owner/wallet': '/owner/wallet',
	'/owner/issuers': '/owner/issuers',
	'/owner/scan': '/owner/scan',
	'/owner/alerts': '/owner/alerts',
	'/owner/others': '/owner/others',
	'/owner/activity': '/owner/activity',
	'/owner/profile': '/owner/profile',
	'/owner/security': '/owner/security',
	'/wallet': '/signatura/dashboard',
	'/wallet/credentials': '/signatura/documents',
	'/wallet/profile': '/signatura/settings/security',
	'/wallet/settings': '/signatura/settings',
	'/wallet/scan': '/signatura/documents/scan',
	'/wallet/scan-login': '/signatura/scan-login',
	'/wallet/approve-accura-login': '/signatura/approve-accura-login',
	'/wallet/issuers': '/signatura/documents/issuers',
	'/security/devices': '/signatura/trusted-devices',
	'/security/add-device': '/signatura/trusted-devices/add',
	'/security/add-passkey': '/signatura/trusted-devices/add-passkey',
	'/security/recovery-codes': '/signatura/settings/recovery-codes',
	'/issuer-portal': '/issuer',
};

function splitPathAndSearch(pathWithSearch) {
	const value = String(pathWithSearch || '');
	const queryIndex = value.indexOf('?');
	if (queryIndex === -1) {
		return { pathname: value, search: '' };
	}

	return {
		pathname: value.slice(0, queryIndex),
		search: value.slice(queryIndex),
	};
}

function matchesPathPrefix(pathname, prefix) {
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isPublicRoute(pathname) {
	return PUBLIC_ROUTES.some((route) => matchesPathPrefix(pathname, route));
}

function isPortalPath(pathname) {
	return PORTAL_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix));
}

function isLegacyRedirectPath(pathname) {
	if (pathname === '/security') {
		return false;
	}

	return LEGACY_REDIRECT_PREFIXES.some((prefix) =>
		matchesPathPrefix(pathname, prefix),
	);
}

function normalizeLoginNextPath(pathWithSearch) {
	const { pathname, search } = splitPathAndSearch(pathWithSearch);

	if (!pathname.startsWith('/')) {
		return '/signatura/dashboard';
	}

	if (EXACT_LEGACY_NEXT_MAP[pathname]) {
		return `${EXACT_LEGACY_NEXT_MAP[pathname]}${search}`;
	}

	if (pathname.startsWith('/issuer-portal/')) {
		return `/issuer/${pathname.slice('/issuer-portal/'.length)}${search}`;
	}

	if (pathname.startsWith('/wallet/issuers/')) {
		return `/signatura/documents/issuers/${pathname.slice('/wallet/issuers/'.length)}${search}`;
	}

	if (pathname.startsWith('/wallet/')) {
		return `/signatura/dashboard${search}`;
	}

	if (pathname.startsWith('/security/')) {
		return `/signatura/trusted-devices${search}`;
	}

	return `${pathname}${search}`;
}

function getNextConfigRedirects() {
	return LEGACY_REDIRECTS.map((redirect) => ({
		...redirect,
		permanent: false,
	}));
}

export {
	EXACT_LEGACY_NEXT_MAP,
	LEGACY_REDIRECTS,
	PORTAL_PREFIXES,
	PUBLIC_ROUTES,
	getNextConfigRedirects,
	isLegacyRedirectPath,
	isPortalPath,
	isPublicRoute,
	matchesPathPrefix,
	normalizeLoginNextPath,
};
