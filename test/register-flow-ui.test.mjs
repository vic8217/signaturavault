import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('new account onboarding continues to device registration before recovery phrase', async () => {
	const source = await readFile(
		new URL('../src/components/RegisterPasskeyForm.js', import.meta.url),
		'utf8',
	);
	const createAccountBody = source.slice(
		source.indexOf('async function createAccount'),
		source.indexOf('async function registerDevice'),
	);

	assert.match(createAccountBody, /setCreatedAccount\(data\.user\)/);
	assert.match(createAccountBody, /setRegistrationToken\(data\.registrationToken \|\| ''\)/);
	assert.match(createAccountBody, /accountType/);
	assert.match(createAccountBody, /setStep\('device'\)/);
	assert.doesNotMatch(createAccountBody, /returnToLoginModal\(\)/);
});

test('account duplicate contact check is scoped by Signatura account type', async () => {
	const route = await readFile(
		new URL('../src/app/api/auth/register/account/route.ts', import.meta.url),
		'utf8',
	);
	const schema = await readFile(
		new URL('../prisma/schema.prisma', import.meta.url),
		'utf8',
	);

	assert.match(route, /getSignaturaAccountType/);
	assert.match(route, /matchingContactUsers\.find/);
	assert.match(
		route,
		/getSignaturaAccountType\(user\.signaturaId\) === accountType/,
	);
	assert.doesNotMatch(schema, /emailLookupHash\s+String\?\s+@unique/);
	assert.doesNotMatch(schema, /mobileLookupHash\s+String\?\s+@unique/);
	assert.match(schema, /@@index\(\[emailLookupHash\]\)/);
	assert.match(schema, /@@index\(\[mobileLookupHash\]\)/);
});

test('login modal no longer exposes manual portal role buttons', async () => {
	const source = await readFile(
		new URL('../src/components/LoginModal.js', import.meta.url),
		'utf8',
	);

	assert.doesNotMatch(source, /Portal access/);
	assert.doesNotMatch(source, /SIGNATURA_ADMIN/);
	assert.doesNotMatch(source, /Dev Admin/);
});

test('public registration does not expose admin account selection', async () => {
	const registerPage = await readFile(
		new URL('../src/app/register/page.js', import.meta.url),
		'utf8',
	);
	const registerForm = await readFile(
		new URL('../src/components/RegisterPasskeyForm.js', import.meta.url),
		'utf8',
	);

	assert.doesNotMatch(registerPage, /requestedAccountType === 'admin'/);
	assert.doesNotMatch(registerForm, /Account class/);
	assert.doesNotMatch(registerForm, /SIG-A-XXXX-XXXX/);
	assert.match(registerForm, /Create issuer Signatura ID/);
});

test('admin registration uses a separate admin URL', async () => {
	const loginForm = await readFile(
		new URL('../src/components/LoginPasskeyForm.js', import.meta.url),
		'utf8',
	);
	const adminRegisterPage = await readFile(
		new URL('../src/app/admin/register/page.js', import.meta.url),
		'utf8',
	);

	assert.match(loginForm, /\/admin\/register\?next=/);
	assert.match(adminRegisterPage, /initialAccountType="admin"/);
	assert.match(adminRegisterPage, /href="\/login\?next=\/admin"/);
});
