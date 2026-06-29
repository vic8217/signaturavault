import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { POST as createAccount } from '@/app/api/auth/register/account/route.ts';
import {
	accountLookupHashes,
	normalizeEmail,
	normalizeHandphone,
} from '@/lib/account-private-fields.js';
import {
	accuraRegistrationContextForForm,
	issueAccuraRegistrationHandoffToken,
	notifyAccuraChallengeApproval,
	verifyAccuraRegistrationHandoffToken,
} from '@/lib/accuraRegistrationHandoff.js';
import { prisma, resetHarness } from './harness/state.mjs';

const SECRET = 'accura-registration-handoff-test-secret';

function withSecret() {
	const previous = {
		handoff: process.env.ACCURA_REGISTRATION_HANDOFF_SECRET,
		callback: process.env.ACCURA_REGISTRATION_CALLBACK_SECRET,
		clientId: process.env.SIGNATURA_CLIENT_ID,
	};
	process.env.ACCURA_REGISTRATION_HANDOFF_SECRET = SECRET;
	process.env.ACCURA_REGISTRATION_CALLBACK_SECRET = SECRET;
	process.env.SIGNATURA_CLIENT_ID = 'accura';
	return () => {
		if (previous.handoff === undefined) {
			delete process.env.ACCURA_REGISTRATION_HANDOFF_SECRET;
		} else {
			process.env.ACCURA_REGISTRATION_HANDOFF_SECRET = previous.handoff;
		}
		if (previous.callback === undefined) {
			delete process.env.ACCURA_REGISTRATION_CALLBACK_SECRET;
		} else {
			process.env.ACCURA_REGISTRATION_CALLBACK_SECRET = previous.callback;
		}
		if (previous.clientId === undefined) {
			delete process.env.SIGNATURA_CLIENT_ID;
		} else {
			process.env.SIGNATURA_CLIENT_ID = previous.clientId;
		}
	};
}

function handoffPayload(overrides = {}) {
	return {
		jti: `handoff-${crypto.randomUUID()}`,
		requestId: `req-${crypto.randomUUID()}`,
		state: `state-${crypto.randomUUID()}`,
		nonce: `nonce-${crypto.randomUUID()}`,
		clientId: 'accura',
		sourceApp: 'accura',
		companyId: 'company-road',
		companyCode: 'road-9b2d7b',
		companyName: 'RoadRunner BeepBeep',
		roleCode: 'CASH',
		roleName: 'Cashier',
		registrationKeyId: 'key-cadm-cash-1',
		returnUrl: 'http://localhost:3001/accura/register/callback',
		expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
		...overrides,
	};
}

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

test('ACCURA handoff token verifies locked company and staff role context', () => {
	const restore = withSecret();
	try {
		const token = issueAccuraRegistrationHandoffToken(handoffPayload());
		const verified = verifyAccuraRegistrationHandoffToken(token);
		assert.equal(verified.valid, true);

		const context = accuraRegistrationContextForForm(verified.context);
		assert.equal(context.source, 'accura');
		assert.equal(context.companyId, 'company-road');
		assert.equal(context.companyCode, 'ROAD-9B2D7B');
		assert.equal(context.rolePrefix, 'CASH');
		assert.equal(context.role, 'Cashier');
		assert.equal(context.registrationKeyId, 'key-cadm-cash-1');
		assert.equal(context.challengeId, verified.context.requestId);
		assert.equal(context.originDevice, 'desktop');
		assert.equal(context.flowType, 'cross_device_qr');
	} finally {
		restore();
	}
});

test('ACCURA handoff token preserves same-device flow metadata', () => {
	const restore = withSecret();
	try {
		const token = issueAccuraRegistrationHandoffToken(
			handoffPayload({
				challengeId: 'challenge-mobile-1',
				originDevice: 'mobile',
				flowType: 'same_device_deeplink',
			}),
		);
		const verified = verifyAccuraRegistrationHandoffToken(token);
		const context = accuraRegistrationContextForForm(verified.context);

		assert.equal(verified.valid, true);
		assert.equal(context.challengeId, 'challenge-mobile-1');
		assert.equal(context.originDevice, 'mobile');
		assert.equal(context.flowType, 'same_device_deeplink');
	} finally {
		restore();
	}
});

test('ACCURA challenge approval callback posts the exact polled challengeId', async () => {
	const previousFetch = globalThis.fetch;
	const previousApproveUrl = process.env.ACCURA_CHALLENGE_APPROVE_URL;
	const previousAllowedOrigins = process.env.ACCURA_ALLOWED_ORIGINS;
	const calls = [];
	globalThis.fetch = async (url, options) => {
		calls.push({ url: String(url), options });
		return new Response(JSON.stringify({ ok: true }), { status: 200 });
	};
	delete process.env.ACCURA_CHALLENGE_APPROVE_URL;
	process.env.ACCURA_ALLOWED_ORIGINS = 'https://accura-sandbox.nouvoux.com';

	try {
		const result = await notifyAccuraChallengeApproval({
			returnUrl: 'https://accura-sandbox.nouvoux.com/register/callback',
			challengeId: '5df3f640-e989-44ac-aa63-df805594ea83',
			signaturaId: 'SIG-U-B64A-3A1A',
			verificationToken: 'verification-token-1',
			status: 'APPROVED',
		});

		assert.equal(result.ok, true);
		assert.equal(
			calls[0].url,
			'https://accura-sandbox.nouvoux.com/api/signatura/challenge-approve',
		);
		assert.equal(calls[0].options.method, 'POST');
		assert.deepEqual(JSON.parse(calls[0].options.body), {
			challengeId: '5df3f640-e989-44ac-aa63-df805594ea83',
			signaturaId: 'SIG-U-B64A-3A1A',
			verificationToken: 'verification-token-1',
			status: 'APPROVED',
		});
	} finally {
		globalThis.fetch = previousFetch;
		if (previousApproveUrl === undefined) {
			delete process.env.ACCURA_CHALLENGE_APPROVE_URL;
		} else {
			process.env.ACCURA_CHALLENGE_APPROVE_URL = previousApproveUrl;
		}
		if (previousAllowedOrigins === undefined) {
			delete process.env.ACCURA_ALLOWED_ORIGINS;
		} else {
			process.env.ACCURA_ALLOWED_ORIGINS = previousAllowedOrigins;
		}
	}
});

test('ACCURA handoff token rejects tampering and CADM staff-key escalation', () => {
	const restore = withSecret();
	try {
		const token = issueAccuraRegistrationHandoffToken(handoffPayload());
		const [payload, signature] = token.split('.');
		const tamperedPayload = Buffer.from(
			JSON.stringify({
				...JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
				roleCode: 'CADM',
			}),
		).toString('base64url');

		assert.equal(
			verifyAccuraRegistrationHandoffToken(`${tamperedPayload}.${signature}`).valid,
			false,
		);
		assert.throws(
			() => issueAccuraRegistrationHandoffToken(handoffPayload({ roleCode: 'CADM' })),
			/Company Admin registration requires|staff registration keys cannot create admin/i,
		);
		assert.throws(
			() =>
				issueAccuraRegistrationHandoffToken(
					handoffPayload({
						expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
					}),
				),
			/lifetime is too long/i,
		);
	} finally {
		restore();
	}
});

test('ACCURA handoff token accepts CADM only for validated company-admin registration', () => {
	const restore = withSecret();
	try {
		const token = issueAccuraRegistrationHandoffToken(
			handoffPayload({
				roleCode: 'CADM',
				roleName: 'Company Admin',
				registrationType: 'company_admin',
			}),
		);
		const verified = verifyAccuraRegistrationHandoffToken(token);

		assert.equal(verified.valid, true);
		assert.equal(verified.context.roleCode, 'CADM');
		assert.equal(verified.context.registrationType, 'company_admin');
		assert.throws(
			() =>
				issueAccuraRegistrationHandoffToken(
					handoffPayload({
						roleCode: 'CASH',
						registrationType: 'company_admin',
					}),
				),
			/must use the CADM role/i,
		);
	} finally {
		restore();
	}
});

test('ACCURA account registration cannot create a Signatura identity', async () => {
	resetHarness();
	const restore = withSecret();
	try {
		const token = issueAccuraRegistrationHandoffToken(handoffPayload());
		const response = await createAccount(
			request({
				fullName: 'Ava Cashier',
				handphone: '+63 917 111 2222',
				email: 'ava.cashier@example.com',
				accountType: 'user',
				source: 'accura',
				accuraHandoffToken: token,
				companyId: 'forged-company',
				companyCode: 'FORGED',
				role: 'Company Admin',
				rolePrefix: 'CADM',
				registrationKeyId: 'forged-key',
				returnUrl: 'http://localhost:3001/evil',
			}),
		);
		const body = await response.json();

		assert.equal(response.status, 409);
		assert.match(body.error, /ACCURA cannot create Signatura identities/i);
		assert.equal(body.linkRequired, true);
		assert.equal(body.identityRequired, true);
		assert.equal(prisma.user.__rows.length, 0);
		assert.equal(prisma.signaturaAppLink.__rows.length, 0);
		assert.equal(prisma.accuraRegistrationHandoff.__rows.length, 0);
	} finally {
		restore();
	}
});

test('ACCURA registration requires linking an existing Signatura identity for a role', async () => {
	resetHarness();
	const restore = withSecret();
	try {
		const email = normalizeEmail('ava.multi@example.com');
		const handphone = normalizeHandphone('+63 917 777 8888');
		const { emailLookupHash, mobileLookupHash } = accountLookupHashes({
			email,
			handphone,
		});
		prisma.user.__seed([
			{
				id: 'user-ava-multi',
				signaturaId: 'SIG-U-1111-2222',
				emailLookupHash,
				mobileLookupHash,
				accountStatus: 'active',
				trustLevel: 2,
				createdAt: new Date(),
			},
		]);

		const secondToken = issueAccuraRegistrationHandoffToken(
			handoffPayload({
				roleCode: 'PAYR',
				roleName: 'Payroll Clerk',
				registrationKeyId: 'key-cadm-payroll-1',
			}),
		);
		const secondResponse = await createAccount(
			request({
				fullName: 'Ava Multi Role',
				handphone: '+63 917 777 8888',
				email: 'ava.multi@example.com',
				accountType: 'user',
				source: 'accura',
				accuraHandoffToken: secondToken,
			}),
		);
		const secondBody = await secondResponse.json();

		assert.equal(secondResponse.status, 409);
		assert.equal(secondBody.linkRequired, true);
		assert.equal(secondBody.existingSignaturaId, 'SIG-U-1111-2222');
		assert.equal(prisma.user.__rows.length, 1);
		assert.equal(prisma.signaturaAppLink.__rows.length, 0);
	} finally {
		restore();
	}
});

test('ACCURA SADM registration also requires an existing Signatura identity', async () => {
	resetHarness();
	const restore = withSecret();
	try {
		const token = issueAccuraRegistrationHandoffToken(
			handoffPayload({
				companyId: 'accura-platform',
				companyCode: 'ACCURA',
				companyName: 'ACCURA Platform',
				roleCode: 'SADM',
				roleName: 'System Admin',
				registrationType: 'system_admin',
				registrationKeyId: 'platform-system-admin',
			}),
		);
		const response = await createAccount(
			request({
				fullName: 'Platform Admin',
				handphone: '+63 917 000 1111',
				email: 'platform.admin@example.com',
				accountType: 'user',
				source: 'accura',
				accuraHandoffToken: token,
			}),
		);
		const body = await response.json();

		assert.equal(response.status, 409);
		assert.match(body.error, /ACCURA cannot create Signatura identities/i);
		assert.equal(prisma.user.__rows.length, 0);
	} finally {
		restore();
	}
});

test('ACCURA role linking claims each signed handoff only once', async () => {
	const source = await readFile(
		new URL(
			'../src/app/api/auth/register/accura/link/route.ts',
			import.meta.url,
		),
		'utf8',
	);

	assert.match(source, /status: 'PROCESSING'/);
	assert.match(source, /status: 'CLAIMED'/);
	assert.match(source, /already used/);
	assert.match(source, /status: 'APPROVED'/);
	assert.match(source, /verificationToken/);
	assert.match(source, /approvedChallengeId/);
	assert.match(source, /body\.challengeId/);
	assert.match(
		source,
		/OR: \[\{ tokenId: context\.jti \}, \{ challengeId: approvedChallengeId \}\]/,
	);
	assert.match(source, /notifyAccuraChallengeApproval/);
	assert.match(source, /flowType !== 'same_device_deeplink'/);
	assert.match(source, /Approved successfully\. You may return to the original ACCURA browser window/);
});
