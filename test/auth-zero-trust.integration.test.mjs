import assert from 'node:assert/strict';
import test from 'node:test';

import {
	hashRecoveryPhrase,
	makeRecoveryPhrase,
	normalizeRecoveryPhrase,
} from '@/lib/auth/recoveryPhrase';
import {
	enforceRateLimit,
	rateLimitKey,
	resetRateLimitsForTests,
} from '@/lib/auth/rateLimit';
import { prisma, resetHarness } from './harness/state.mjs';
import {
	consumeTrustedDeviceLoginChallenge,
	createTrustedDeviceLoginChallenge,
	pollTrustedDeviceLoginChallenge,
} from '@/lib/trustedDeviceLoginChallenge.js';

test('recovery phrase is hashed and never stored verbatim', () => {
	const phrase = makeRecoveryPhrase();
	const normalized = normalizeRecoveryPhrase(phrase);
	const hash = hashRecoveryPhrase(phrase);
	assert.ok(normalized.includes(' '));
	assert.notEqual(hash, phrase);
	assert.notEqual(hash, normalized);
});

test('rate limiting blocks repeated auth attempts', () => {
	resetRateLimitsForTests();
	const key = rateLimitKey(
		new Request('http://localhost', {
			headers: { 'x-forwarded-for': '203.0.113.10' },
		}),
		'recovery_phrase_attempt',
		'SIG-TEST-0001',
	);
	assert.equal(enforceRateLimit(key, { max: 2, windowMs: 60_000 }), null);
	assert.equal(enforceRateLimit(key, { max: 2, windowMs: 60_000 }), null);
	const blocked = enforceRateLimit(key, { max: 2, windowMs: 60_000 });
	assert.ok(blocked?.retryAfterMs >= 0);
});

test('expired QR login challenge is rejected', async () => {
	resetHarness();
	const userId = 'user-expired-challenge';
	prisma.user.__rows.push({
		id: userId,
		signaturaId: 'SIG-EXPIRED-01',
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

	await assert.rejects(
		() =>
			pollTrustedDeviceLoginChallenge({
				challengeId: challenge.id,
				browserSecret,
			}),
		/not found|expired/i,
	);
});

test('login without trusted-device approval is rejected', async () => {
	resetHarness();
	const userId = 'user-unapproved';
	prisma.user.__rows.push({
		id: userId,
		signaturaId: 'SIG-NOAPPROVE',
		trustLevel: 2,
		accountStatus: 'active',
	});

	const { challenge, browserSecret } = await createTrustedDeviceLoginChallenge({
		userId,
		nextPath: '/signatura/dashboard',
	});

	await assert.rejects(
		() =>
			consumeTrustedDeviceLoginChallenge({
				challengeId: challenge.id,
				browserSecret,
				approvalToken: 'fake-token',
			}),
		/not approved|not ready|invalid|not found|expired/i,
	);
});
