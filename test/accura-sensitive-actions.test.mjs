import assert from 'node:assert/strict';
import test from 'node:test';

import { POST as approveAccuraAction } from '@/app/api/signatura/accura/sensitive-actions/approve/route.js';
import { POST as verifyAccuraUnlockToken } from '@/app/api/signatura/accura/unlock-tokens/verify/route.js';
import {
	approveTrustedDeviceLoginChallenge,
	consumeTrustedDeviceLoginChallenge,
	createTrustedDeviceLoginChallenge,
	pollTrustedDeviceLoginChallenge,
} from '@/lib/trustedDeviceLoginChallenge.js';
import { prisma, resetHarness } from './harness/state.mjs';

const CLIENT_ID = 'accura';
const CLIENT_SECRET = 'accura-secret-test';
const UNLOCK_SECRET = 'accura-unlock-secret-test';

function setEnv() {
	const previous = {
		id: process.env.SIGNATURA_CLIENT_ID,
		secret: process.env.SIGNATURA_CLIENT_SECRET,
		unlock: process.env.ACCURA_UNLOCK_TOKEN_SECRET,
	};
	process.env.SIGNATURA_CLIENT_ID = CLIENT_ID;
	process.env.SIGNATURA_CLIENT_SECRET = CLIENT_SECRET;
	process.env.ACCURA_UNLOCK_TOKEN_SECRET = UNLOCK_SECRET;
	return () => {
		if (previous.id === undefined) delete process.env.SIGNATURA_CLIENT_ID;
		else process.env.SIGNATURA_CLIENT_ID = previous.id;
		if (previous.secret === undefined) delete process.env.SIGNATURA_CLIENT_SECRET;
		else process.env.SIGNATURA_CLIENT_SECRET = previous.secret;
		if (previous.unlock === undefined) delete process.env.ACCURA_UNLOCK_TOKEN_SECRET;
		else process.env.ACCURA_UNLOCK_TOKEN_SECRET = previous.unlock;
	};
}

function authHeaders() {
	return {
		'content-type': 'application/json',
		authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
	};
}

function request(url, body) {
	return new Request(url, {
		method: 'POST',
		headers: authHeaders(),
		body: JSON.stringify(body),
	});
}

function seedAccuraUser() {
	const userId = 'user-accura-sensitive';
	const signaturaId = 'SIG-U-ACCURA-OWNER-1';
	prisma.user.__rows.push({
		id: userId,
		signaturaId,
		trustLevel: 2,
		accountStatus: 'active',
	});
	prisma.trustedDevice.__rows.push({
		id: 'device-accura-sensitive',
		userId,
		credentialId: 'cred-accura-sensitive',
		isTrusted: true,
		removedAt: null,
		status: 'active',
	});
	prisma.signaturaAppLink.__rows.push({
		id: 'link-accura-sensitive',
		userId,
		signaturaId,
		sourceApp: 'ACCURA',
		companyCode: 'ROAD-0F7C99',
		companyId: 'company-road',
		tenantId: 'tenant-road',
		accuraUserId: 'accura-user-1',
		role: 'cash_manager',
		rolePrefix: 'CASH',
		moduleAccess: ['CASH_PAYMENTS', 'REPORTS'],
		permissionSet: ['CASH_PAYMENTS:RELEASE_PAYMENT', 'REPORTS:MASS_EXPORT'],
		registrationContext: { sourceApp: 'ACCURA' },
		trustedDeviceStatus: 'TRUSTED',
		status: 'ACTIVE',
		createdAt: new Date(),
	});
	return { userId, signaturaId };
}

async function seedConsumedApprovalChallenge(userId) {
	const { challenge, browserSecret } = await createTrustedDeviceLoginChallenge({
		userId,
		nextPath: '/accura/approve-sensitive-action',
		clientId: CLIENT_ID,
		sourceApp: 'ACCURA',
		requesterOrigin: 'https://accura.example',
		rolePrefix: 'CASH',
		requestedAssuranceLevel: 'ZT-L2',
	});
	await approveTrustedDeviceLoginChallenge({
		challengeId: challenge.id,
		shortCode: challenge.shortCode,
		approverUserId: userId,
		credentialId: 'cred-accura-sensitive',
		trustedDeviceId: 'device-accura-sensitive',
	});
	const poll = await pollTrustedDeviceLoginChallenge({
		challengeId: challenge.id,
		browserSecret,
	});
	await consumeTrustedDeviceLoginChallenge({
		challengeId: challenge.id,
		browserSecret,
		approvalToken: poll.approvalToken,
	});
	return prisma.trustedDeviceLoginChallenge.__rows.find(
		(entry) => entry.id === challenge.id,
	);
}

test('Signatura approves ACCURA sensitive action and verifies scoped unlock token', async () => {
	resetHarness();
	const restore = setEnv();
	try {
		const { userId, signaturaId } = seedAccuraUser();
		const challenge = await seedConsumedApprovalChallenge(userId);
		const approvalResponse = await approveAccuraAction(
			request('http://localhost/api/signatura/accura/sensitive-actions/approve', {
				challengeId: challenge.id,
				signaturaId,
				companyCode: 'ROAD-0F7C99',
				companyId: 'company-road',
				tenantId: 'tenant-road',
				accuraUserId: 'accura-user-1',
				module: 'cash payments',
				action: 'release payment',
				resourceId: 'payment-1',
				deviceId: 'accura-device-1',
				sessionId: 'accura-session-1',
			}),
		);
		const approval = await approvalResponse.json();

		assert.equal(approvalResponse.status, 200);
		assert.equal(approval.approved, true);
		assert.equal(approval.scope.module, 'CASH_PAYMENTS');
		assert.equal(approval.scope.action, 'RELEASE_PAYMENT');
		assert.ok(approval.unlockToken);

		const verifyResponse = await verifyAccuraUnlockToken(
			request('http://localhost/api/signatura/accura/unlock-tokens/verify', {
				unlockToken: approval.unlockToken,
				signaturaId,
				userId,
				tenantId: 'tenant-road',
				module: 'CASH_PAYMENTS',
				action: 'RELEASE_PAYMENT',
				resourceId: 'payment-1',
				deviceId: 'accura-device-1',
				sessionId: 'accura-session-1',
			}),
		);
		const verification = await verifyResponse.json();

		assert.equal(verifyResponse.status, 200);
		assert.equal(verification.valid, true);
		assert.equal(verification.scope.tenantId, 'tenant-road');
		assert.equal(
			prisma.securityAuditLog.__rows.some(
				(row) => row.action === 'ACCURA_UNLOCK_TOKEN_USED',
			),
			true,
		);
	} finally {
		restore();
	}
});

test('Signatura denies ACCURA sensitive action outside module permissions', async () => {
	resetHarness();
	const restore = setEnv();
	try {
		const { userId, signaturaId } = seedAccuraUser();
		const challenge = await seedConsumedApprovalChallenge(userId);
		const response = await approveAccuraAction(
			request('http://localhost/api/signatura/accura/sensitive-actions/approve', {
				challengeId: challenge.id,
				signaturaId,
				companyCode: 'ROAD-0F7C99',
				module: 'PAYROLL',
				action: 'APPROVE_PAYROLL',
				resourceId: 'payroll-1',
				deviceId: 'accura-device-1',
				sessionId: 'accura-session-1',
			}),
		);
		const body = await response.json();

		assert.equal(response.status, 403);
		assert.equal(body.reason, 'action_not_allowed');
		assert.equal(
			prisma.securityAuditLog.__rows.some(
				(row) => row.action === 'ACCURA_SENSITIVE_ACTION_DENIED',
			),
			true,
		);
	} finally {
		restore();
	}
});

test('Signatura unlock token verification rejects tenant mismatch', async () => {
	resetHarness();
	const restore = setEnv();
	try {
		const { userId, signaturaId } = seedAccuraUser();
		const challenge = await seedConsumedApprovalChallenge(userId);
		const approvalResponse = await approveAccuraAction(
			request('http://localhost/api/signatura/accura/sensitive-actions/approve', {
				challengeId: challenge.id,
				signaturaId,
				tenantId: 'tenant-road',
				module: 'REPORTS',
				action: 'MASS_EXPORT',
				resourceId: 'export-1',
				deviceId: 'accura-device-1',
				sessionId: 'accura-session-1',
			}),
		);
		const approval = await approvalResponse.json();

		const verifyResponse = await verifyAccuraUnlockToken(
			request('http://localhost/api/signatura/accura/unlock-tokens/verify', {
				unlockToken: approval.unlockToken,
				signaturaId,
				userId,
				tenantId: 'other-tenant',
				module: 'REPORTS',
				action: 'MASS_EXPORT',
				resourceId: 'export-1',
				deviceId: 'accura-device-1',
				sessionId: 'accura-session-1',
			}),
		);
		const body = await verifyResponse.json();

		assert.equal(verifyResponse.status, 403);
		assert.equal(body.valid, false);
		assert.equal(body.reason, 'scope_mismatch');
	} finally {
		restore();
	}
});
