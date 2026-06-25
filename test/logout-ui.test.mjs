import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const authenticatedUiFiles = [
	'../src/app/signatura/layout.js',
	'../src/app/wallet/layout.js',
	'../src/app/admin/layout.js',
	'../src/app/issuer/layout.js',
	'../src/app/owner/others/page.js',
];

test('authenticated UI links sign out controls to the logout endpoint', async () => {
	for (const file of authenticatedUiFiles) {
		const source = await readFile(new URL(file, import.meta.url), 'utf8');

		assert.match(source, /\/api\/auth\/logout/, file);
		assert.doesNotMatch(source, /href="\/api\/auth\/session"/, file);
	}
});

test('admin sign out returns to the admin portal login', async () => {
	const source = await readFile(
		new URL('../src/app/admin/layout.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /adminLogoutHref/);
	assert.match(source, /\/admin\/login\?next=\/admin/);
	assert.match(source, /href=\{adminLogoutHref\}/);
});

test('issuer sign out returns to issuer web login', async () => {
	const source = await readFile(
		new URL('../src/app/issuer/layout.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /issuerLogoutHref/);
	assert.match(source, /\/login\?next=\/issuer/);
	assert.match(source, /href=\{issuerLogoutHref\}/);
});

test('logout route redirects to login and clears auth cookies defensively', async () => {
	const source = await readFile(
		new URL('../src/app/api/auth/logout/route.ts', import.meta.url),
		'utf8',
	);

	assert.match(source, /url\.searchParams\.get\('redirect'\) \|\| '\/login'/);
	assert.match(source, /clearAuthCookies/);
	assert.match(source, /ROLE_COOKIE/);
	assert.match(source, /tryLogLogout/);
	assert.match(source, /resolvePublicSignaturaOrigin/);
	assert.match(source, /new URL\(redirectTo, resolvePublicSignaturaOrigin\(req\)\)/);
});

test('owner mobile others page exposes a visible sign out row', async () => {
	const source = await readFile(
		new URL('../src/app/owner/others/page.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /Session/);
	assert.match(source, /Sign out/);
	assert.match(source, /LogOut/);
	assert.match(source, /End this trusted device session/);
});
