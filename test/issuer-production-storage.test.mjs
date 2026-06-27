import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('production issuer registry uses Prisma instead of legacy JSON storage', async () => {
	const adminIssuersRoute = await readFile(
		new URL('../src/app/api/admin/issuers/route.js', import.meta.url),
		'utf8',
	);
	const registerIssuerRoute = await readFile(
		new URL('../src/app/api/issuers/register/route.js', import.meta.url),
		'utf8',
	);
	const issuerAuthorization = await readFile(
		new URL('../src/lib/issuer-authorization.js', import.meta.url),
		'utf8',
	);
	const schema = await readFile(
		new URL('../prisma/schema.prisma', import.meta.url),
		'utf8',
	);

	assert.match(adminIssuersRoute, /prisma\.issuer\.findMany/);
	assert.match(adminIssuersRoute, /prisma\.tenant\.findMany/);
	assert.doesNotMatch(adminIssuersRoute, /loadDb|withDb|db\.issuers/);

	assert.match(registerIssuerRoute, /prisma\.issuer\.create/);
	assert.match(registerIssuerRoute, /prisma\.tenant\.create/);
	assert.match(registerIssuerRoute, /prisma\.issuerApiClient\.create/);
	assert.match(registerIssuerRoute, /prisma\.issuerApiKey\.create/);
	assert.doesNotMatch(registerIssuerRoute, /withDb|db\.issuers|db\.tenants/);

	assert.match(schema, /model IssuerAuthorizationCode/);
	assert.match(issuerAuthorization, /prisma\.issuerAuthorizationCode\.create/);
	assert.match(issuerAuthorization, /prisma\.issuerAuthorizationCode\.findFirst/);
	assert.doesNotMatch(issuerAuthorization, /loadDb|saveDb/);
});
