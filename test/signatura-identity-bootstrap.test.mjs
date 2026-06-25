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

test('new issuer invitation bootstrap continues to recovery before membership activation', async () => {
	const finishRoute = await readFile(
		new URL('../src/app/api/issuer-invitations/activation/finish/route.ts', import.meta.url),
		'utf8',
	);
	const activateRoute = await readFile(
		new URL('../src/app/api/auth/register/activate/route.ts', import.meta.url),
		'utf8',
	);
	const transactionBody = finishRoute.slice(
		finishRoute.indexOf('const result = await prisma.$transaction'),
		finishRoute.indexOf("await logSecurityEvent(req, 'issuer_trusted_device_registered'"),
	);
	const registrationModeBlock = transactionBody.slice(
		transactionBody.indexOf("if (mode === 'registration')"),
		transactionBody.indexOf('const updated = await tx.issuerInvitation.updateMany'),
	);
	const activationBody = activateRoute.slice(
		activateRoute.indexOf('const updatedUser = await prisma.$transaction'),
		activateRoute.indexOf("await logSecurityEvent(req, 'account_activated'"),
	);

	assert.match(transactionBody, /tx\.webAuthnCredential\.(update|create)/);
	assert.match(transactionBody, /tx\.trustedDevice\.(updateMany|create)/);
	assert.match(registrationModeBlock, /type: 'REGISTER_ACCOUNT'/);
	assert.match(registrationModeBlock, /REGISTRATION_STATUSES\.TRUSTED_DEVICE_REGISTERED/);
	assert.match(registrationModeBlock, /requiresRecovery: true/);
	assert.doesNotMatch(registrationModeBlock, /ensureIssuerMembershipRole/);
	assert.match(activateRoute, /recoveryCode/);
	assert.match(activateRoute, /trustedDeviceCount/);
	assert.match(activationBody, /ensureIssuerMembershipRole/);
	assert.match(activationBody, /accountStatus: 'active'/);
	assert.ok(
		activationBody.indexOf("accountStatus: 'active'") >
			activationBody.indexOf('ensureIssuerMembershipRole'),
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

test('admin phone setup requires recovery before admin session activation', async () => {
	const adminFinishRoute = await readFile(
		new URL('../src/app/api/admin/passkey/register/finish/route.ts', import.meta.url),
		'utf8',
	);
	const adminSetupForm = await readFile(
		new URL('../src/components/AdminSetupPasskeyForm.js', import.meta.url),
		'utf8',
	);
	const registerForm = await readFile(
		new URL('../src/components/RegisterPasskeyForm.js', import.meta.url),
		'utf8',
	);
	const activateRoute = await readFile(
		new URL('../src/app/api/auth/register/activate/route.ts', import.meta.url),
		'utf8',
	);
	const adminStatusRoute = await readFile(
		new URL('../src/app/api/admin/setup-token/status/route.ts', import.meta.url),
		'utf8',
	);

	assert.match(adminFinishRoute, /requiresRecovery: true/);
	assert.match(adminFinishRoute, /REGISTRATION_STATUSES\.TRUSTED_DEVICE_REGISTERED/);
	assert.match(adminFinishRoute, /type: 'REGISTER_ACCOUNT'/);
	assert.doesNotMatch(adminFinishRoute, /createAuthenticatedLoginResponse/);
	assert.doesNotMatch(adminFinishRoute, /accountStatus: 'active'/);
	assert.match(adminSetupForm, /\/api\/auth\/register\/recovery/);
	assert.match(adminSetupForm, /Save your recovery phrase/);
	assert.match(adminSetupForm, /\/api\/auth\/register\/activate/);
	assert.match(activateRoute, /isAdminIdentity/);
	assert.match(activateRoute, /ROLES\.SIGNATURA_ADMIN/);
	assert.match(activateRoute, /redirectTo = issuerInvitation[\s\S]+\? '\/admin'/);
	assert.match(adminStatusRoute, /completedSession/);
	assert.match(adminStatusRoute, /type: 'REGISTER_ACCOUNT'/);
	assert.match(adminStatusRoute, /admin_setup_desktop_session_created/);
	assert.match(registerForm, /cache: 'no-store'/);
	assert.match(registerForm, /data\.next/);
	assert.match(registerForm, /setError\(data\.error/);
});
