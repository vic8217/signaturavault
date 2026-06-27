import assert from 'node:assert/strict';
import test from 'node:test';

import { POST as approveRemoteLogin } from '@/app/api/auth/login/remote/approve/route.js';
import { POST as finishRemoteLogin } from '@/app/api/auth/login/remote/finish/route.js';
import { cookieJar, makeSessionCookie, prisma, resetHarness } from './harness/state.mjs';
import {
	approveTrustedDeviceLoginChallenge,
	buildQrLoginApprovalChallenge,
	consumeTrustedDeviceLoginChallenge,
	createTrustedDeviceLoginChallenge,
	pollTrustedDeviceLoginChallenge,
	requireTrustedActiveLoginDevice,
} from '@/lib/trustedDeviceLoginChallenge.js';
import { trustedDeviceBindingHash } from '@/lib/trustedDeviceBinding.js';

function seedUser(userId = 'user-remote-login-test') {
	prisma.user.__rows.push({
		id: userId,
		signaturaId: `SIG-${userId.toUpperCase()}`,
		trustLevel: 2,
		accountStatus: 'active',
	});
	return userId;
}

test('trusted device login challenge approves and consumes once', async () => {
	resetHarness();
	const userId = seedUser();

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

test('issuer QR login finish opens issuer portal after approval', async () => {
	resetHarness();
	const userId = seedUser('issuer-qr-login');
	prisma.issuerUser.__rows.push({
		id: 'issuer-user-qr-login',
		userId,
		tenantId: 'tenant-issuer-qr-login',
		issuerId: 'issuer-qr-login',
		role: 'ISSUER_ADMIN',
		status: 'active',
		activatedAt: new Date(),
	});

	const { challenge, browserSecret } = await createTrustedDeviceLoginChallenge({
		userId,
		nextPath: '/issuer',
		browserUserAgent: 'desktop browser',
		clientId: 'signatura_issuer',
		sourceApp: 'SIGNATURA_ISSUER',
	});
	await approveTrustedDeviceLoginChallenge({
		challengeId: challenge.id,
		shortCode: challenge.shortCode,
		approverUserId: userId,
		credentialId: 'cred-phone',
		trustedDeviceId: 'device-phone',
	});
	const poll = await pollTrustedDeviceLoginChallenge({
		challengeId: challenge.id,
		browserSecret,
	});
	assert.equal(poll.status, 'APPROVED');
	assert.ok(poll.approvalToken);

	const response = await finishRemoteLogin(
		new Request('https://signatura.test/api/auth/login/remote/finish', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				challengeId: challenge.id,
				browserSecret,
				approvalToken: poll.approvalToken,
			}),
		}),
	);
	const body = await response.json();
	assert.equal(response.status, 200);
	assert.equal(body.ok, true);
	assert.equal(body.next, '/issuer');
	assert.equal(body.user.signaturaId, 'SIG-ISSUER-QR-LOGIN');
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

test('QR login WebAuthn challenge is bound to exact QR challenge material', async () => {
	resetHarness();
	const userId = seedUser('user-bound');
	const { challenge } = await createTrustedDeviceLoginChallenge({
		userId,
		nextPath: '/signatura/dashboard',
		browserUserAgent: 'Desktop browser A',
		clientId: 'accura',
		sourceApp: 'ACCURA',
		requesterOrigin: 'https://accura.example',
		requestedAssuranceLevel: 'ZT-L2',
	});

	const original = buildQrLoginApprovalChallenge(challenge);
	const tampered = buildQrLoginApprovalChallenge({
		...challenge,
		browserSecretHash: `${challenge.browserSecretHash}-changed`,
	});

	assert.match(original.challenge, /^[A-Za-z0-9_-]+$/);
	assert.notEqual(original.challenge, tampered.challenge);
	assert.equal(original.payload.challengeId, challenge.id);
	assert.equal(original.payload.shortCode, challenge.shortCode);
	assert.equal(original.payload.userId, userId);
	assert.equal(original.payload.browserSecretHash, challenge.browserSecretHash);
	assert.equal(original.payload.requestingBrowserContext.userAgent, 'Desktop browser A');
	assert.equal(original.payload.nonce, challenge.nonce);
	assert.equal(original.payload.clientId, 'accura');
	assert.equal(original.payload.sourceApp, 'ACCURA');
	assert.equal(original.payload.requesterOrigin, 'https://accura.example');
	assert.equal(original.payload.requestedAssuranceLevel, 'ZT-L2');
});

test('QR login challenge stores client app and requester origin context', async () => {
	resetHarness();
	const userId = seedUser('user-context');
	const { challenge } = await createTrustedDeviceLoginChallenge({
		userId,
		nextPath: '/signatura/dashboard',
		clientId: 'accura',
		sourceApp: 'ACCURA',
		requesterOrigin: 'https://accura.example',
		requestedAssuranceLevel: 'ZT-L2',
	});

	assert.equal(challenge.clientId, 'accura');
	assert.equal(challenge.sourceApp, 'ACCURA');
	assert.equal(challenge.requesterOrigin, 'https://accura.example');
	assert.equal(challenge.requestedAssuranceLevel, 'ZT-L2');
});

test('trusted active device lookup rejects untrusted, inactive, and mismatched credentials', async () => {
	resetHarness();
	const userId = seedUser('user-device-gates');
	const deviceBindingSecret = 'registered-phone-local-binding-secret';
	prisma.trustedDevice.__rows.push(
		{
			id: 'device-untrusted',
			userId,
			credentialId: 'cred-untrusted-device',
			isTrusted: false,
			removedAt: null,
			status: 'active',
			deviceHash: trustedDeviceBindingHash({
				userId,
				credentialId: 'cred-untrusted-device',
				deviceBindingSecret,
			}),
		},
		{
			id: 'device-inactive',
			userId,
			credentialId: 'cred-inactive-device',
			isTrusted: true,
			removedAt: null,
			status: 'suspended',
			deviceHash: trustedDeviceBindingHash({
				userId,
				credentialId: 'cred-inactive-device',
				deviceBindingSecret,
			}),
		},
		{
			id: 'device-active',
			userId,
			credentialId: 'cred-active-device',
			isTrusted: true,
			removedAt: null,
			status: 'active',
			deviceHash: trustedDeviceBindingHash({
				userId,
				credentialId: 'cred-active-device',
				deviceBindingSecret,
			}),
		},
	);

	await assert.rejects(
		() =>
			requireTrustedActiveLoginDevice({
				userId,
				credentialId: 'cred-untrusted-device',
				deviceBindingSecret,
			}),
		/Trusted active device proof required/,
	);
	await assert.rejects(
		() =>
			requireTrustedActiveLoginDevice({
				userId,
				credentialId: 'cred-inactive-device',
				deviceBindingSecret,
			}),
		/Trusted active device proof required/,
	);
	await assert.rejects(
		() =>
			requireTrustedActiveLoginDevice({
				userId,
				credentialId: 'cred-mismatched',
				deviceBindingSecret,
			}),
		/Trusted active device proof required/,
	);
	await assert.rejects(
		() =>
			requireTrustedActiveLoginDevice({
				userId,
				credentialId: 'cred-active-device',
				deviceBindingSecret: 'different-phone-secret',
			}),
		/not registered for QR approval/,
	);

	const trustedDevice = await requireTrustedActiveLoginDevice({
		userId,
		credentialId: 'cred-active-device',
		deviceBindingSecret,
	});
	assert.equal(trustedDevice.id, 'device-active');
});

test('expired QR login challenge cannot be approved', async () => {
	resetHarness();
	const userId = seedUser('user-expired-approve');
	const { challenge } = await createTrustedDeviceLoginChallenge({
		userId,
		nextPath: '/signatura/dashboard',
	});
	const row = prisma.trustedDeviceLoginChallenge.__rows.find(
		(entry) => entry.id === challenge.id,
	);
	row.expiresAt = new Date(Date.now() - 1000);

	await assert.rejects(
		() =>
			approveTrustedDeviceLoginChallenge({
				challengeId: challenge.id,
				shortCode: challenge.shortCode,
				approverUserId: userId,
				credentialId: 'cred-phone',
				trustedDeviceId: 'device-1',
			}),
		/not found|expired/i,
	);
});

test('concurrent double-approve only approves one request', async () => {
	resetHarness();
	const userId = seedUser('user-double-approve');
	const { challenge } = await createTrustedDeviceLoginChallenge({
		userId,
		nextPath: '/signatura/dashboard',
	});

	const results = await Promise.allSettled([
		approveTrustedDeviceLoginChallenge({
			challengeId: challenge.id,
			shortCode: challenge.shortCode,
			approverUserId: userId,
			credentialId: 'cred-phone',
			trustedDeviceId: 'device-1',
		}),
		approveTrustedDeviceLoginChallenge({
			challengeId: challenge.id,
			shortCode: challenge.shortCode,
			approverUserId: userId,
			credentialId: 'cred-phone',
			trustedDeviceId: 'device-1',
		}),
	]);

	assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
	assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
	assert.match(
		String(results.find((result) => result.status === 'rejected')?.reason?.message),
		/already approved|expired/,
	);
});

test('concurrent double-consume only consumes one approved QR login', async () => {
	resetHarness();
	const userId = seedUser('user-double-consume');
	const { challenge, browserSecret } = await createTrustedDeviceLoginChallenge({
		userId,
		nextPath: '/signatura/dashboard',
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

	const results = await Promise.allSettled([
		consumeTrustedDeviceLoginChallenge({
			challengeId: challenge.id,
			browserSecret,
			approvalToken: poll.approvalToken,
		}),
		consumeTrustedDeviceLoginChallenge({
			challengeId: challenge.id,
			browserSecret,
			approvalToken: poll.approvalToken,
		}),
	]);

	assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
	assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
	assert.match(
		String(results.find((result) => result.status === 'rejected')?.reason?.message),
		/already used/,
	);
});

test('remote approval route rejects approval without WebAuthn assertion', async () => {
	resetHarness();
	const userId = seedUser('user-no-assertion');
	cookieJar.set(
		'signatura_session',
		makeSessionCookie({
			userId,
			signaturaId: 'SIG-USER-NO-ASSERTION',
			iat: Date.now(),
			exp: Date.now() + 60_000,
		}),
	);
	const { challenge } = await createTrustedDeviceLoginChallenge({
		userId,
		nextPath: '/signatura/dashboard',
	});

	const response = await approveRemoteLogin(
		new Request('http://localhost/api/auth/login/remote/approve', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				challengeId: challenge.id,
				shortCode: challenge.shortCode,
			}),
		}),
	);
	const body = await response.json();

	assert.equal(response.status, 400);
	assert.match(body.error, /WebAuthn assertion is required/);
});
