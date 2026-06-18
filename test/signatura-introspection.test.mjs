import assert from 'node:assert/strict';
import test from 'node:test';

import { POST as finishRemoteLogin } from '@/app/api/auth/login/remote/finish/route.js';
import { POST as introspect } from '@/app/api/signatura/introspect/route.js';
import {
	approveTrustedDeviceLoginChallenge,
	createTrustedDeviceLoginChallenge,
	LOGIN_CHALLENGE_STATUS,
	pollTrustedDeviceLoginChallenge,
} from '@/lib/trustedDeviceLoginChallenge.js';
import { prisma, resetHarness } from './harness/state.mjs';

const CLIENT_ID = 'accura';
const CLIENT_SECRET = 'accura-secret-test';

function setClientEnv() {
	const previous = {
		id: process.env.SIGNATURA_CLIENT_ID,
		secret: process.env.SIGNATURA_CLIENT_SECRET,
	};
	process.env.SIGNATURA_CLIENT_ID = CLIENT_ID;
	process.env.SIGNATURA_CLIENT_SECRET = CLIENT_SECRET;
	return () => {
		if (previous.id === undefined) delete process.env.SIGNATURA_CLIENT_ID;
		else process.env.SIGNATURA_CLIENT_ID = previous.id;
		if (previous.secret === undefined) delete process.env.SIGNATURA_CLIENT_SECRET;
		else process.env.SIGNATURA_CLIENT_SECRET = previous.secret;
	};
}

function authHeaders(secret = CLIENT_SECRET) {
	return {
		'content-type': 'application/json',
		authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${secret}`).toString('base64')}`,
	};
}

function request(body, headers = authHeaders()) {
	return new Request('http://localhost/api/signatura/introspect', {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	});
}

function finishRequest(body) {
	return new Request('http://localhost/api/auth/login/remote/finish', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

function seedUser(userId = 'user-introspection') {
	prisma.user.__rows.push({
		id: userId,
		signaturaId: 'SIG-ACCURA-ROAD-0F7C99-INVT-ABC123-0001',
		trustLevel: 2,
		accountStatus: 'active',
	});
	prisma.signaturaAppLink.__rows.push({
		id: `link-${userId}`,
		userId,
		signaturaId: 'SIG-ACCURA-ROAD-0F7C99-INVT-ABC123-0001',
		sourceApp: 'ACCURA',
		companyCode: 'ROAD-0F7C99',
		role: 'inventory_clerk',
		rolePrefix: 'INVT',
		status: 'ACTIVE',
		createdAt: new Date(),
	});
	return userId;
}

async function seedApprovedChallenge({
	userId,
	withTrustedDevice = true,
	expired = false,
	clientId = CLIENT_ID,
	sourceApp = 'ACCURA',
} = {}) {
	const challengeUserId = userId || seedUser();
	if (withTrustedDevice) {
		prisma.trustedDevice.__rows.push({
			id: 'device-introspection',
			userId: challengeUserId,
			credentialId: 'cred-introspection',
			isTrusted: true,
			removedAt: null,
			status: 'active',
		});
	}
	const { challenge, browserSecret } = await createTrustedDeviceLoginChallenge({
		userId: challengeUserId,
		nextPath: '/signatura/dashboard',
		clientId,
		sourceApp,
		requesterOrigin: 'https://accura.example',
		requestedAssuranceLevel: 'ZT-L2',
	});
	await approveTrustedDeviceLoginChallenge({
		challengeId: challenge.id,
		shortCode: challenge.shortCode,
		approverUserId: challengeUserId,
		credentialId: 'cred-introspection',
		trustedDeviceId: 'device-introspection',
	});
	const row = prisma.trustedDeviceLoginChallenge.__rows.find(
		(entry) => entry.id === challenge.id,
	);
	if (expired) row.expiresAt = new Date(Date.now() - 1000);
	return { challenge: row, browserSecret };
}

test('introspection rejects missing client authentication', async () => {
	resetHarness();
	const restore = setClientEnv();
	try {
		const response = await introspect(
			request({ challengeId: 'missing' }, { 'content-type': 'application/json' }),
		);
		const body = await response.json();

		assert.equal(response.status, 401);
		assert.deepEqual(body, { active: false, reason: 'invalid_client' });
	} finally {
		restore();
	}
});

test('introspection rejects invalid client secret', async () => {
	resetHarness();
	const restore = setClientEnv();
	try {
		const response = await introspect(
			request({ challengeId: 'missing' }, authHeaders('wrong-secret')),
		);
		const body = await response.json();

		assert.equal(response.status, 401);
		assert.deepEqual(body, { active: false, reason: 'invalid_client' });
	} finally {
		restore();
	}
});

test('introspection returns trustedDevice=false when no active trusted device remains', async () => {
	resetHarness();
	const restore = setClientEnv();
	try {
		seedUser();
		const { challenge } = await seedApprovedChallenge({ withTrustedDevice: false });
		const response = await introspect(
			request({
				challengeId: challenge.id,
				expectedSignaturaId: 'SIG-ACCURA-ROAD-0F7C99-INVT-ABC123-0001',
			}),
		);
		const body = await response.json();

		assert.equal(response.status, 200);
		assert.equal(body.active, false);
		assert.equal(body.reason, 'untrusted_device');
		assert.equal(body.trustedDevice, false);
	} finally {
		restore();
	}
});

test('valid ACCURA trusted-device challenge returns active=true without browser session cookie', async () => {
	resetHarness();
	const restore = setClientEnv();
	try {
		const { challenge } = await seedApprovedChallenge();
		const response = await introspect(
			request({
				challengeId: challenge.id,
				expectedSignaturaId: 'SIG-ACCURA-ROAD-0F7C99-INVT-ABC123-0001',
			}),
		);
		const body = await response.json();

		assert.equal(response.status, 200);
		assert.equal(body.active, true);
		assert.equal(body.signaturaId, 'SIG-ACCURA-ROAD-0F7C99-INVT-ABC123-0001');
		assert.equal(body.rolePrefix, 'INVT');
		assert.equal(body.companyCode, 'ROAD-0F7C99');
		assert.equal(body.identityVerified, true);
		assert.equal(body.trustedDevice, true);
		assert.equal(body.keyUnlocked, false);
		assert.equal(body.sessionType, 'trusted-device');
		assert.equal(body.assuranceLevel, 'ZT-L2');
		assert.equal(body.clientId, CLIENT_ID);
		assert.equal(body.sourceApp, 'ACCURA');
		assert.ok(body.expiresAt);
		assert.equal(
			prisma.trustedDeviceLoginChallenge.__rows.find(
				(row) => row.id === challenge.id,
			).status,
			LOGIN_CHALLENGE_STATUS.CONSUMED,
		);
	} finally {
		restore();
	}
});

test('introspection accepts signaturaAssertion as challenge reference', async () => {
	resetHarness();
	const restore = setClientEnv();
	try {
		const { challenge } = await seedApprovedChallenge();
		const response = await introspect(
			request({
				signaturaAssertion: challenge.id,
				expectedSignaturaId: 'SIG-ACCURA-ROAD-0F7C99-INVT-ABC123-0001',
			}),
		);
		const body = await response.json();

		assert.equal(response.status, 200);
		assert.equal(body.active, true);
		assert.equal(body.trustedDevice, true);
	} finally {
		restore();
	}
});

test('expired challenge introspection returns active=false', async () => {
	resetHarness();
	const restore = setClientEnv();
	try {
		const { challenge } = await seedApprovedChallenge({ expired: true });
		const response = await introspect(
			request({
				challengeId: challenge.id,
				expectedSignaturaId: 'SIG-ACCURA-ROAD-0F7C99-INVT-ABC123-0001',
			}),
		);
		const body = await response.json();

		assert.equal(response.status, 200);
		assert.deepEqual(body, { active: false, reason: 'expired' });
	} finally {
		restore();
	}
});

test('reused ACCURA challenge introspection returns active=false', async () => {
	resetHarness();
	const restore = setClientEnv();
	try {
		const { challenge } = await seedApprovedChallenge();
		const body = {
			challengeId: challenge.id,
			expectedSignaturaId: 'SIG-ACCURA-ROAD-0F7C99-INVT-ABC123-0001',
		};
		const first = await introspect(request(body));
		assert.equal((await first.json()).active, true);

		const second = await introspect(request(body));
		const secondBody = await second.json();

		assert.equal(second.status, 200);
		assert.deepEqual(secondBody, { active: false, reason: 'already_consumed' });
	} finally {
		restore();
	}
});

test('mismatched Signatura ID returns active=false', async () => {
	resetHarness();
	const restore = setClientEnv();
	try {
		const { challenge } = await seedApprovedChallenge();
		const response = await introspect(
			request({
				challengeId: challenge.id,
				expectedSignaturaId: 'SIG-ACCURA-ROAD-0F7C99-INVT-OTHER-0002',
			}),
		);
		const body = await response.json();

		assert.equal(response.status, 200);
		assert.deepEqual(body, { active: false, reason: 'signatura_id_mismatch' });
	} finally {
		restore();
	}
});

test('wrong clientId challenge returns active=false', async () => {
	resetHarness();
	const restore = setClientEnv();
	try {
		const { challenge } = await seedApprovedChallenge({ clientId: 'other' });
		const response = await introspect(
			request({
				challengeId: challenge.id,
				expectedSignaturaId: 'SIG-ACCURA-ROAD-0F7C99-INVT-ABC123-0001',
			}),
		);
		const body = await response.json();

		assert.equal(response.status, 404);
		assert.deepEqual(body, { active: false, reason: 'not_found' });
	} finally {
		restore();
	}
});

test('suspended account returns active=false', async () => {
	resetHarness();
	const restore = setClientEnv();
	try {
		const userId = seedUser();
		prisma.user.__rows.find((row) => row.id === userId).accountStatus =
			'suspended';
		const { challenge } = await seedApprovedChallenge({ userId });
		const response = await introspect(
			request({
				challengeId: challenge.id,
				expectedSignaturaId: 'SIG-ACCURA-ROAD-0F7C99-INVT-ABC123-0001',
			}),
		);
		const body = await response.json();

		assert.equal(response.status, 200);
		assert.deepEqual(body, { active: false, reason: 'account_inactive' });
	} finally {
		restore();
	}
});

test('QR approval cannot trigger device enrollment automatically', async () => {
	resetHarness();
	const userId = seedUser('user-no-auto-enroll');
	prisma.trustedDevice.__rows.push({
		id: 'device-no-auto-enroll',
		userId,
		credentialId: 'cred-no-auto-enroll',
		isTrusted: true,
		removedAt: null,
		status: 'active',
	});
	const { challenge, browserSecret } = await createTrustedDeviceLoginChallenge({
		userId,
		nextPath: '/signatura/dashboard',
		clientId: CLIENT_ID,
		sourceApp: 'ACCURA',
		requesterOrigin: 'https://accura.example',
	});
	await approveTrustedDeviceLoginChallenge({
		challengeId: challenge.id,
		shortCode: challenge.shortCode,
		approverUserId: userId,
		credentialId: 'cred-no-auto-enroll',
		trustedDeviceId: 'device-no-auto-enroll',
	});
	const poll = await pollTrustedDeviceLoginChallenge({
		challengeId: challenge.id,
		browserSecret,
	});

	const response = await finishRemoteLogin(
		finishRequest({
			challengeId: challenge.id,
			browserSecret,
			approvalToken: poll.approvalToken,
		}),
	);
	const body = await response.json();

	assert.equal(response.status, 200);
	assert.equal(body.canRegisterDevice, false);
});
