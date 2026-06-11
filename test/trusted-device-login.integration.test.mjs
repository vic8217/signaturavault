import assert from 'node:assert/strict';
import test from 'node:test';

import { prisma, resetHarness } from './harness/state.mjs';
import {
	approveTrustedDeviceLoginChallenge,
	consumeTrustedDeviceLoginChallenge,
	createTrustedDeviceLoginChallenge,
	pollTrustedDeviceLoginChallenge,
} from '@/lib/trustedDeviceLoginChallenge.js';

test('trusted device login challenge approves and consumes once', async () => {
	resetHarness();
	const userId = 'user-remote-login-test';
	prisma.user.__rows.push({
		id: userId,
		signaturaId: 'SIG-REMOTE-0001',
		trustLevel: 1,
		accountStatus: 'active',
	});

	const { challenge, browserSecret } = await createTrustedDeviceLoginChallenge({
		userId,
		nextPath: '/signatura/dashboard',
		browserUserAgent: 'test-browser',
	});

	await approveTrustedDeviceLoginChallenge({
		challengeId: challenge.id,
		shortCode: challenge.shortCode,
		approverUserId: userId,
		credentialId: 'cred-phone',
		trustedDeviceId: 'device-1',
	});

	const poll = await pollTrustedDeviceLoginChallenge({
		challengeId: challenge.id,
		browserSecret,
	});
	assert.equal(poll.status, 'APPROVED');
	assert.ok(poll.approvalToken);

	const consumed = await consumeTrustedDeviceLoginChallenge({
		challengeId: challenge.id,
		browserSecret,
		approvalToken: poll.approvalToken,
	});
	assert.equal(consumed.user.id, userId);
	assert.equal(consumed.nextPath, '/signatura/dashboard');

	await assert.rejects(
		() =>
			consumeTrustedDeviceLoginChallenge({
				challengeId: challenge.id,
				browserSecret,
				approvalToken: poll.approvalToken,
			}),
		/already used/,
	);
});

test('expired trusted device login challenge cannot be consumed', async () => {
	resetHarness();
	const userId = 'user-expired-login';
	prisma.user.__rows.push({
		id: userId,
		signaturaId: 'SIG-EXPIRED-02',
		trustLevel: 2,
		accountStatus: 'active',
	});

	const { challenge, browserSecret } = await createTrustedDeviceLoginChallenge({
		userId,
		nextPath: '/signatura/dashboard',
	});

	const row = prisma.trustedDeviceLoginChallenge.__rows.find(
		(entry) => entry.id === challenge.id,
	);
	row.expiresAt = new Date(Date.now() - 1000);
	row.status = 'APPROVED';
	row.approvalTokenHash = 'approved';

	await assert.rejects(
		() =>
			consumeTrustedDeviceLoginChallenge({
				challengeId: challenge.id,
				browserSecret,
				approvalToken: 'approved',
			}),
		/not found|expired/i,
	);
});

test('trusted device login challenge rejects mismatched approver', async () => {
	resetHarness();
	const { challenge } = await createTrustedDeviceLoginChallenge({
		userId: 'user-a',
		nextPath: '/signatura/dashboard',
	});

	await assert.rejects(
		() =>
			approveTrustedDeviceLoginChallenge({
				challengeId: challenge.id,
				shortCode: challenge.shortCode,
				approverUserId: 'user-b',
				credentialId: 'cred-phone',
				trustedDeviceId: 'device-1',
			}),
		/does not match/,
	);
});
