import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('identity creation is centralized in the Signatura Identity Service', async () => {
	const service = await readFile(
		new URL('../src/lib/signaturaIdentityService.js', import.meta.url),
		'utf8',
	);
	const registerRoute = await readFile(
		new URL('../src/app/api/auth/register/account/route.ts', import.meta.url),
		'utf8',
	);
	const issuerStartRoute = await readFile(
		new URL('../src/app/api/issuer-invitations/activation/start/route.ts', import.meta.url),
		'utf8',
	);
	const accuraRoleRoute = await readFile(
		new URL('../src/app/api/signatura/accura/role-signatura-id/route.js', import.meta.url),
		'utf8',
	);

	assert.match(service, /IDENTITY_BOOTSTRAP_ORDER/);
	assert.match(service, /createUniqueSignaturaId/);
	assert.match(service, /client\.user\.create/);
	assert.match(service, /SIGNATURA_ACCOUNT_TYPES\.DOCUMENT_OWNER/);
	assert.match(registerRoute, /createSignaturaIdentity/);
	assert.match(issuerStartRoute, /createPendingInvitationIdentity/);
	assert.doesNotMatch(registerRoute, /createUniqueSignaturaId/);
	assert.doesNotMatch(issuerStartRoute, /createUniqueSignaturaId/);
	assert.doesNotMatch(registerRoute, /tx\.user\.create|prisma\.user\.create/);
	assert.doesNotMatch(issuerStartRoute, /tx\.user\.create|prisma\.user\.create/);
	assert.doesNotMatch(accuraRoleRoute, /createUniqueAccuraSignaturaId/);
});

test('issuer invitation bootstrap attaches membership after passkey or trusted-device approval', async () => {
	const finishRoute = await readFile(
		new URL('../src/app/api/issuer-invitations/activation/finish/route.ts', import.meta.url),
		'utf8',
	);
	const transactionBody = finishRoute.slice(
		finishRoute.indexOf('const user = await prisma.$transaction'),
		finishRoute.indexOf("await logSecurityEvent(req, 'issuer_trusted_device_registered'"),
	);

	assert.match(transactionBody, /tx\.webAuthnCredential\.(update|create)/);
	assert.match(transactionBody, /tx\.trustedDevice\.(updateMany|create)/);
	assert.match(transactionBody, /ensureIssuerMembershipRole/);
	assert.match(transactionBody, /accountStatus: 'active'/);
	assert.ok(
		transactionBody.indexOf('ensureIssuerMembershipRole') >
			transactionBody.indexOf('tx.trustedDevice'),
	);
	assert.ok(
		transactionBody.indexOf("accountStatus: 'active'") >
			transactionBody.indexOf('ensureIssuerMembershipRole'),
	);
});

test('ACCURA role endpoint keeps one Signatura ID and attaches role membership', async () => {
	const route = await readFile(
		new URL('../src/app/api/signatura/accura/role-signatura-id/route.js', import.meta.url),
		'utf8',
	);

	assert.match(route, /ensureAccuraMembershipRole/);
	assert.match(route, /const roleSignaturaId = user\.signaturaId/);
	assert.match(route, /universalIdentity: true/);
	assert.doesNotMatch(route, /SIG-ACCURA-\$\{/);
	assert.doesNotMatch(route, /createUniqueAccuraSignaturaId/);
});
