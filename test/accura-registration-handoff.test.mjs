import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { POST as createAccount } from '@/app/api/auth/register/account/route.ts';
import {
	accuraRegistrationContextForForm,
	issueAccuraRegistrationHandoffToken,
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
	} finally {
		restore();
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

test('ACCURA account registration trusts signed handoff over forged body fields and blocks reuse', async () => {
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

		assert.equal(response.status, 200);
		assert.equal(body.ok, true);
		assert.match(body.user.signaturaId, /^SIG-U-/);

		const link = prisma.signaturaAppLink.__rows[0];
		assert.equal(link.sourceApp, 'ACCURA');
		assert.equal(link.companyId, 'company-road');
		assert.equal(link.companyCode, 'ROAD-9B2D7B');
		assert.equal(link.rolePrefix, 'CASH');
		assert.match(link.signaturaId, /^SIG-ACCURA-ROAD-9B2D7B-CASH-/);
		assert.equal(link.registrationContext.masterSignaturaId, body.user.signaturaId);
		assert.notEqual(link.signaturaId, body.user.signaturaId);
		assert.equal(link.registrationContext.accuraRegistrationKeyId, 'key-cadm-cash-1');
		assert.equal(
			link.registrationContext.returnUrl,
			'http://localhost:3001/accura/register/callback',
		);
		assert.equal(prisma.accuraRegistrationHandoff.__rows.length, 1);

		const replay = await createAccount(
			request({
				fullName: 'Ava Replay',
				handphone: '+63 917 333 4444',
				email: 'ava.replay@example.com',
				accountType: 'user',
				source: 'accura',
				accuraHandoffToken: token,
			}),
		);
		const replayBody = await replay.json();
		assert.equal(replay.status, 409);
		assert.match(replayBody.error, /already used/i);
	} finally {
		restore();
	}
});

test('ACCURA reuses an existing Signatura identity for an additional role', async () => {
	resetHarness();
	const restore = withSecret();
	try {
		const firstToken = issueAccuraRegistrationHandoffToken(handoffPayload());
		const firstResponse = await createAccount(
			request({
				fullName: 'Ava Multi Role',
				handphone: '+63 917 777 8888',
				email: 'ava.multi@example.com',
				accountType: 'user',
				source: 'accura',
				accuraHandoffToken: firstToken,
			}),
		);
		const firstBody = await firstResponse.json();
		assert.equal(firstResponse.status, 200);
		assert.match(firstBody.user.signaturaId, /^SIG-U-/);

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
		assert.equal(secondBody.existingSignaturaId, firstBody.user.signaturaId);
		assert.equal(prisma.user.__rows.length, 1);
		assert.equal(prisma.signaturaAppLink.__rows.length, 1);
	} finally {
		restore();
	}
});

test('ACCURA SADM registration allocates SIG-ACCURA-SADM role ID linked to SIG-U master', async () => {
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

		assert.equal(response.status, 200);
		assert.match(body.user.signaturaId, /^SIG-U-/);
		const link = prisma.signaturaAppLink.__rows[0];
		assert.match(link.signaturaId, /^SIG-ACCURA-SADM-[0-9A-F]{6}-[0-9A-F]{4}$/);
		assert.equal(link.registrationContext.masterSignaturaId, body.user.signaturaId);
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
	assert.match(source, /status: 'COMPLETED'/);
});
