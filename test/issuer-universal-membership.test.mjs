import assert from 'node:assert/strict';
import test from 'node:test';

import { POST as createAccount } from '@/app/api/auth/register/account/route.ts';
import { prisma, resetHarness } from './harness/state.mjs';

function request(body) {
	return new Request('http://localhost/api/auth/register/account', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'user-agent': 'node-test',
		},
		body: JSON.stringify(body),
	});
}

test('issuer authorization code attaches pending membership to one Universal ID', async () => {
	resetHarness();
	prisma.issuerAuthorizationCode.__seed([
		{
			id: 'auth-code-1',
			issuerId: 'issuer-alpha',
			tenantId: 'tenant-alpha',
			codeHash:
				'45cbed698632eb56a195b2edf674e448d00a74ae6c8555b97e09e450bfdb2764',
			label: 'Issuer Alpha onboarding',
			status: 'active',
			expiresAt: new Date(Date.now() + 5 * 60 * 1000),
			createdAt: new Date(),
		},
	]);

	const response = await createAccount(
		request({
			fullName: 'Orion Issuer',
			handphone: '+63 917 555 6666',
			email: 'orion.issuer@example.com',
			accountType: 'issuer',
			authorizationCode: 'issuer-code',
		}),
	);
	const body = await response.json();

	assert.equal(response.status, 200);
	assert.match(body.user.signaturaId, /^SIG-U-/);
	assert.equal(prisma.user.__rows.length, 1);
	assert.equal(prisma.issuerUser.__rows.length, 1);
	assert.equal(prisma.membership.__rows.length, 1);
	assert.equal(prisma.membership.__rows[0].identityId, body.user.id);
	assert.equal(prisma.membership.__rows[0].status, 'PENDING_ACTIVATION');
	assert.equal(prisma.role.__rows[0].code, 'ISSUER_ADMIN');
	assert.equal(prisma.membershipRole.__rows.length, 1);

	const duplicate = await createAccount(
		request({
			fullName: 'Orion Issuer',
			handphone: '+63 917 555 6666',
			email: 'orion.issuer@example.com',
			accountType: 'issuer',
			authorizationCode: 'issuer-code',
		}),
	);
	const duplicateBody = await duplicate.json();

	assert.equal(duplicate.status, 409);
	assert.equal(duplicateBody.existingSignaturaId, body.user.signaturaId);
	assert.equal(duplicateBody.linkRequired, true);
	assert.equal(prisma.user.__rows.length, 1);
	assert.equal(prisma.membership.__rows.length, 1);
});
