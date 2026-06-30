import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
	buildAccuraRegistrationReturnUrl,
	issueAccuraRegistrationHandoffToken,
	resolveAccuraReturnUrl,
	verifyAccuraOnboardingAuthorizationCode,
	verifyAccuraRegistrationCallback,
	verifyAccuraRegistrationHandoffToken,
} from '@/lib/accuraRegistrationHandoff.js';

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
		returnUrl: 'http://localhost:3001/invite?token=INV-TEST',
		expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
		mode: 'create',
		...overrides,
	};
}

test('ACCURA handoff includes clientId, state, nonce, and requestId metadata', () => {
	const restore = withSecret();
	try {
		const token = issueAccuraRegistrationHandoffToken(handoffPayload());
		const verified = verifyAccuraRegistrationHandoffToken(token);
		assert.equal(verified.valid, true);
		assert.equal(verified.context.clientId, 'accura');
		assert.equal(verified.context.requestId, verified.context.jti);
		assert.match(verified.context.state, /^state-/);
		assert.match(verified.context.nonce, /^nonce-/);
	} finally {
		restore();
	}
});

test('ACCURA registration callback includes userId and authorization code', () => {
	const restore = withSecret();
	try {
		const returnUrl = buildAccuraRegistrationReturnUrl(
			'http://localhost:3001/invite?token=INV-TEST',
			{
				signaturaId: 'SIG-ACCURA-ROAD-9B2D7B-CASH-789BD6-4411',
				userId: 'user-123',
				signaturaSubjectId: 'user-123',
				companyId: 'company-road',
				companyCode: 'ROAD-9B2D7B',
				roleCode: 'CASH',
				registrationKeyId: 'key-cadm-cash-1',
				requestId: 'req-1',
				state: 'state-1',
				nonce: 'nonce-1',
			},
		);
		const destination = new URL(returnUrl);
		assert.equal(
			destination.searchParams.get('signaturaId'),
			'SIG-ACCURA-ROAD-9B2D7B-CASH-789BD6-4411',
		);
		assert.equal(destination.searchParams.get('userId'), 'user-123');
		assert.equal(destination.searchParams.get('signaturaSubjectId'), 'user-123');
		assert.equal(destination.searchParams.get('state'), 'state-1');
		assert.ok(destination.searchParams.get('proofPayload'));
		assert.ok(destination.searchParams.get('proof'));
		assert.ok(destination.searchParams.get('authorizationCode'));

		const proofPayload = destination.searchParams.get('proofPayload');
		const proof = destination.searchParams.get('proof');
		const verifiedProof = verifyAccuraRegistrationCallback(proofPayload, proof);
		assert.equal(verifiedProof.valid, true);
		assert.equal(verifiedProof.payload.userId, 'user-123');

		const authorizationCode = destination.searchParams.get('authorizationCode');
		const verifiedCode = verifyAccuraOnboardingAuthorizationCode(authorizationCode);
		assert.equal(verifiedCode.valid, true);
		assert.equal(verifiedCode.payload.signaturaId, 'SIG-ACCURA-ROAD-9B2D7B-CASH-789BD6-4411');
	} finally {
		restore();
	}
});

test('ACCURA localhost callback is rewritten to the configured phone-reachable origin', () => {
	const previous = {
		accura: process.env.ACCURA_ORIGIN,
		signatura: process.env.SIGNATURA_PUBLIC_URL,
	};
	process.env.ACCURA_ORIGIN = 'http://192.168.68.139:3001';
	delete process.env.SIGNATURA_PUBLIC_URL;
	try {
		assert.equal(
			resolveAccuraReturnUrl(
				'http://localhost:3001/company-admin/login?companyCode=ROAD-9B2D7B',
			),
			'http://192.168.68.139:3001/company-admin/login?companyCode=ROAD-9B2D7B',
		);
	} finally {
		if (previous.accura === undefined) delete process.env.ACCURA_ORIGIN;
		else process.env.ACCURA_ORIGIN = previous.accura;
		if (previous.signatura === undefined) delete process.env.SIGNATURA_PUBLIC_URL;
		else process.env.SIGNATURA_PUBLIC_URL = previous.signatura;
	}
});

test('ACCURA app approval callback rewrites Signatura-origin URLs to ACCURA', async () => {
	const handoff = await import('../src/lib/accuraRegistrationHandoff.js');
	const previous = {
		accura: process.env.ACCURA_ORIGIN,
		signatura: process.env.SIGNATURA_PUBLIC_URL,
		approve: process.env.ACCURA_CHALLENGE_APPROVE_URL,
	};
	process.env.ACCURA_ORIGIN = 'https://accura-sandbox.nouvoux.com';
	process.env.SIGNATURA_PUBLIC_URL = 'https://sandbox.nouvoux.com';
	delete process.env.ACCURA_CHALLENGE_APPROVE_URL;
	try {
		assert.equal(
			handoff.resolveAccuraAppApprovalCallbackUrl(
				'https://sandbox.nouvoux.com/api/signatura/challenge-approve',
			),
			'https://accura-sandbox.nouvoux.com/api/signatura/challenge-approve',
		);
	} finally {
		if (previous.accura === undefined) delete process.env.ACCURA_ORIGIN;
		else process.env.ACCURA_ORIGIN = previous.accura;
		if (previous.signatura === undefined) delete process.env.SIGNATURA_PUBLIC_URL;
		else process.env.SIGNATURA_PUBLIC_URL = previous.signatura;
		if (previous.approve === undefined) delete process.env.ACCURA_CHALLENGE_APPROVE_URL;
		else process.env.ACCURA_CHALLENGE_APPROVE_URL = previous.approve;
	}
});

test('ACCURA_CHALLENGE_APPROVE_URL origin-only value appends challenge approve path', async () => {
	const handoff = await import('../src/lib/accuraRegistrationHandoff.js');
	const previous = {
		accura: process.env.ACCURA_ORIGIN,
		approve: process.env.ACCURA_CHALLENGE_APPROVE_URL,
	};
	process.env.ACCURA_ORIGIN = 'https://accura-sandbox.nouvoux.com';
	process.env.ACCURA_CHALLENGE_APPROVE_URL = 'https://accura-sandbox.nouvoux.com';
	try {
		assert.equal(
			handoff.resolveAccuraAppApprovalCallbackUrl(
				'https://sandbox.nouvoux.com/api/signatura/challenge-approve',
			),
			'https://accura-sandbox.nouvoux.com/api/signatura/challenge-approve',
		);
	} finally {
		if (previous.accura === undefined) delete process.env.ACCURA_ORIGIN;
		else process.env.ACCURA_ORIGIN = previous.accura;
		if (previous.approve === undefined) delete process.env.ACCURA_CHALLENGE_APPROVE_URL;
		else process.env.ACCURA_CHALLENGE_APPROVE_URL = previous.approve;
	}
});

test('registration callbacks rewrite qr login approve URL to challenge-approve', async () => {
	const handoff = await import('../src/lib/accuraRegistrationHandoff.js');
	const previous = {
		approve: process.env.ACCURA_CHALLENGE_APPROVE_URL,
	};
	delete process.env.ACCURA_CHALLENGE_APPROVE_URL;
	try {
		assert.equal(
			handoff.resolveAccuraAppApprovalCallbackUrl(
				'https://accura-sandbox.nouvoux.com/api/auth/signatura/qr/approve',
			),
			'https://accura-sandbox.nouvoux.com/api/signatura/challenge-approve',
		);
		process.env.ACCURA_CHALLENGE_APPROVE_URL =
			'https://accura-sandbox.nouvoux.com/api/auth/signatura/qr/approve';
		assert.equal(
			handoff.resolveAccuraAppApprovalCallbackUrl(''),
			'https://accura-sandbox.nouvoux.com/api/signatura/challenge-approve',
		);
	} finally {
		if (previous.approve === undefined) delete process.env.ACCURA_CHALLENGE_APPROVE_URL;
		else process.env.ACCURA_CHALLENGE_APPROVE_URL = previous.approve;
	}
});

test('ACCURA link handoff requires linkSignaturaId', () => {
	const restore = withSecret();
	try {
		assert.throws(
			() =>
				issueAccuraRegistrationHandoffToken(
					handoffPayload({ mode: 'link', linkSignaturaId: '' }),
				),
			/link requests must include an existing Signatura ID/i,
		);
		const token = issueAccuraRegistrationHandoffToken(
			handoffPayload({
				mode: 'link',
				linkSignaturaId: 'SIG-ACCURA-ROAD-9B2D7B-CASH-789BD6-4411',
			}),
		);
		const verified = verifyAccuraRegistrationHandoffToken(token);
		assert.equal(verified.valid, true);
		assert.equal(verified.context.mode, 'link');
	} finally {
		restore();
	}
});
