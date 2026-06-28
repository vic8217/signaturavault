import assert from 'node:assert/strict';
import test from 'node:test';

import { POST as activateAccount } from '@/app/api/auth/register/activate/route.ts';
import { prisma, resetHarness } from './harness/state.mjs';

function request(body) {
	return new Request('https://signatura.test/api/auth/register/activate', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'user-agent': 'node-test',
		},
		body: JSON.stringify(body),
	});
}

test('ACCURA Company Admin activation provisions Signatura Invoice Issuer membership', async () => {
	resetHarness({
		user: [
			{
				id: 'user-cadm',
				signaturaId: 'SIG-U-CADM-0001',
				accountStatus: 'pending_activation',
				trustLevel: 1,
				createdAt: new Date(),
			},
		],
		authChallenge: [
			{
				id: 'registration-session-cadm',
				userId: 'user-cadm',
				type: 'REGISTER_ACCOUNT',
				challenge: 'registration-token',
				expiresAt: new Date(Date.now() + 5 * 60 * 1000),
				createdAt: new Date(),
				usedAt: null,
			},
		],
		recoveryCode: [
			{
				id: 'recovery-cadm',
				userId: 'user-cadm',
				codeHash: 'hash-cadm',
				codePrefix: 'RCAD',
				createdAt: new Date(),
			},
		],
		trustedDevice: [
			{
				id: 'device-cadm',
				userId: 'user-cadm',
				deviceHash: 'device-hash-cadm',
				isTrusted: true,
				removedAt: null,
				status: 'active',
				createdAt: new Date(),
			},
		],
		signaturaAppLink: [
			{
				id: 'accura-link-cadm',
				userId: 'user-cadm',
				signaturaId: 'SIG-U-CADM-0001',
				sourceApp: 'ACCURA',
				companyCode: 'ROAD-9B2D7B',
				companyName: 'RoadRunner BeepBeep',
				companyId: 'company-road',
				tenantId: 'company-road',
				role: 'Company Admin',
				rolePrefix: 'CADM',
				status: 'ACTIVE',
				registrationContext: {
					accuraCompanyId: 'company-road',
					accuraCompanyCode: 'ROAD-9B2D7B',
					accuraRoleCode: 'CADM',
					accuraRoleName: 'Company Admin',
					accuraRegistrationKeyId: 'key-cadm-1',
					returnUrl: 'https://accura.test/register/callback',
					handoffTokenId: 'handoff-cadm-1',
					requestId: 'request-cadm-1',
				},
				createdAt: new Date(),
			},
		],
		accuraRegistrationHandoff: [
			{
				id: 'handoff-row-cadm',
				tokenId: 'handoff-cadm-1',
				registrationKeyId: 'key-cadm-1',
				companyId: 'company-road',
				companyCode: 'ROAD-9B2D7B',
				roleCode: 'CADM',
				returnUrl: 'https://accura.test/register/callback',
				status: 'CLAIMED',
				userId: 'user-cadm',
				signaturaId: 'SIG-U-CADM-0001',
				expiresAt: new Date(Date.now() + 5 * 60 * 1000),
			},
		],
	});

	const response = await activateAccount(
		request({ registrationSessionId: 'registration-session-cadm' }),
	);
	const body = await response.json();

	assert.equal(response.status, 200);
	assert.equal(body.ok, true);
	assert.equal(prisma.user.__rows[0].signaturaId, 'SIG-U-CADM-0001');
	assert.equal(prisma.user.__rows.length, 1);

	const roleCodes = prisma.role.__rows.map((role) => role.code).sort();
	assert.deepEqual(roleCodes, ['ACCURA_COMPANY_ADMIN', 'INVOICE_ISSUER']);

	const invoiceRole = prisma.role.__rows.find((role) => role.code === 'INVOICE_ISSUER');
	const invoiceMembershipRole = prisma.membershipRole.__rows.find(
		(entry) => entry.roleId === invoiceRole.id,
	);
	const invoiceMembership = prisma.membership.__rows.find(
		(entry) => entry.id === invoiceMembershipRole.membershipId,
	);
	const invoiceOrganization = prisma.organization.__rows.find(
		(entry) => entry.id === invoiceMembership.organizationId,
	);

	assert.equal(invoiceMembership.identityId, 'user-cadm');
	assert.equal(invoiceMembership.status, 'ACTIVE');
	assert.equal(invoiceOrganization.id, 'invoice_issuer_company-road');
	assert.equal(invoiceOrganization.externalRef, 'invoice_issuer_company-road');
	assert.equal(invoiceOrganization.type, 'INVOICE_ISSUER');
});
