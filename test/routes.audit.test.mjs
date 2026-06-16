import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	LEGACY_REDIRECTS,
	getNextConfigRedirects,
	isLegacyRedirectPath,
	isPublicRoute,
	normalizeLoginNextPath,
} from '../config/portalRoutes.mjs';
import { evaluatePortalAccess } from '../src/lib/portalRoutes.js';

const PUBLIC_ROUTE_CASES = [
	'/',
	'/issuers',
	'/users',
	'/security',
	'/use-cases',
	'/contact',
	'/login',
	'/login/authorize',
	'/register',
	'/signatura/register',
	'/admin/register',
	'/verify',
];

const LEGACY_NEXT_CASES = [
	['/wallet', '/signatura/dashboard'],
	['/wallet/credentials', '/signatura/documents'],
	['/wallet/profile', '/signatura/settings/security'],
	['/wallet/settings', '/signatura/settings'],
	['/wallet/scan', '/signatura/documents/scan'],
	['/security/devices', '/signatura/trusted-devices'],
	['/security/add-device', '/signatura/trusted-devices/add'],
	['/security/add-passkey', '/signatura/trusted-devices/add-passkey'],
	['/security/recovery-codes', '/signatura/settings/recovery-codes'],
	['/issuer-portal', '/issuer'],
	['/issuer-portal/profile', '/issuer/profile'],
	['/issuer-portal/digital-documents', '/issuer/digital-documents'],
	['/issuer-portal/templates', '/issuer/templates'],
];

const PROTECTED_UNAUTH_CASES = [
	['/signatura/dashboard', '/signatura/dashboard'],
	['/signatura/documents', '/signatura/documents'],
	['/signatura/trusted-devices', '/signatura/trusted-devices'],
	['/signatura/settings', '/signatura/settings'],
	['/issuer', '/issuer'],
	['/issuer/profile', '/issuer/profile'],
	['/issuer/templates', '/issuer/templates'],
	['/admin', '/admin'],
];

function parseLoginNext(search) {
	const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
	return decodeURIComponent(params.get('next') || '');
}

for (const route of PUBLIC_ROUTE_CASES) {
	test(`public route allows access: ${route}`, () => {
		assert.equal(isPublicRoute(route), true);
		assert.equal(
			evaluatePortalAccess({ pathname: route, role: undefined }).action,
			'allow',
		);
	});
}

for (const [source, destination] of LEGACY_NEXT_CASES) {
	test(`normalize login next: ${source} -> ${destination}`, () => {
		assert.equal(normalizeLoginNextPath(source), destination);
	});
}

for (const { source, destination } of LEGACY_REDIRECTS) {
	test(`next.config legacy redirect: ${source} -> ${destination}`, () => {
		const redirect = getNextConfigRedirects().find(
			(entry) => entry.source === source,
		);
		assert.ok(redirect, `missing redirect for ${source}`);
		assert.equal(redirect.destination, destination);
		assert.equal(redirect.permanent, false);
	});
}

for (const [pathname, expectedNext] of PROTECTED_UNAUTH_CASES) {
	test(`unauthenticated protected route redirects to login: ${pathname}`, () => {
		const decision = evaluatePortalAccess({ pathname, role: undefined });
		assert.equal(decision.action, 'redirect');
		assert.equal(decision.destination, '/login');
		assert.match(decision.search, /^\?auth=required&next=/);

		const next = parseLoginNext(decision.search);
		assert.equal(next, expectedNext);
	});
}

for (const pathname of ['/wallet', '/security/devices', '/issuer-portal/templates']) {
	test(`legacy route passes through proxy before redirect: ${pathname}`, () => {
		assert.equal(isLegacyRedirectPath(pathname), true);
		assert.equal(
			evaluatePortalAccess({ pathname, role: undefined }).action,
			'allow',
		);
	});
}

test('/security marketing page is public and not treated as legacy', () => {
	assert.equal(isPublicRoute('/security'), true);
	assert.equal(isLegacyRedirectPath('/security'), false);
	assert.equal(
		evaluatePortalAccess({ pathname: '/security', role: undefined }).action,
		'allow',
	);
});

test('/admin/register remains accessible while signed in as a user', () => {
	assert.deepEqual(
		evaluatePortalAccess({
			pathname: '/admin/register',
			role: 'DOCUMENT_OWNER',
		}),
		{ action: 'allow' },
	);
});

test('auth-required redirects never target /', () => {
	for (const pathname of PROTECTED_UNAUTH_CASES.map(([path]) => path)) {
		const decision = evaluatePortalAccess({ pathname, role: undefined });
		assert.notEqual(decision.destination, '/');
	}
});

test('/document-owners redirects to /users in next.config', () => {
	const redirect = getNextConfigRedirects().find(
		(entry) => entry.source === '/document-owners',
	);
	assert.equal(redirect?.destination, '/users');
});
