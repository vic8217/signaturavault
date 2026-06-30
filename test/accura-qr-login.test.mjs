import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
	buildAccuraQrApprovalPath,
	parseAccuraLoginQr,
	parseAccuraRegistrationQr,
} from '@/lib/accuraQrPayload.js';
import { parseSignaturaAppApprovalQr } from '@/lib/signaturaAppApprovalQr.js';
import {
	fetchAccuraQrLoginChallenge,
	postAccuraQrLoginApproval,
} from '@/lib/accuraQrLoginService.js';

test('ACCURA QR parser accepts custom scheme and HTTPS fallback pointers', () => {
	const custom = parseAccuraLoginQr(
		'signatura://login/accura?challengeId=challenge-1&shortCode=AB12&app=ACCURA',
	);
	assert.equal(custom.valid, true);
	assert.equal(custom.challengeId, 'challenge-1');
	assert.equal(custom.shortCode, 'AB12');
	assert.equal(
		buildAccuraQrApprovalPath(custom),
		'/signatura/approve-accura-login?challengeId=challenge-1&shortCode=AB12',
	);

	const https = parseAccuraLoginQr(
		'https://signatura.example/wallet/scan-login?app=ACCURA&challengeId=challenge-2&shortCode=xy-9',
	);
	assert.equal(https.valid, true);
	assert.equal(https.shortCode, 'XY-9');
});

test('ACCURA registration QR parser accepts register/accura handoff links', () => {
	const registration = parseAccuraRegistrationQr(
		'https://signatura.example/register/accura?handoffToken=abc123&mode=register&source=accura&sourceApp=ACCURA',
	);
	assert.equal(registration.valid, true);
	assert.equal(registration.handoffToken, 'abc123');
	assert.equal(
		registration.href,
		'/register/accura?handoffToken=abc123&mode=register&source=accura&sourceApp=ACCURA',
	);
	const installGate = parseAccuraRegistrationQr(
		'https://signatura.example/app?handoffToken=abc123&source=accura&sourceApp=ACCURA',
	);
	assert.equal(installGate.valid, true);
	assert.equal(installGate.handoffToken, 'abc123');
	assert.equal(
		installGate.href,
		'/app?handoffToken=abc123&source=accura&sourceApp=ACCURA',
	);
	const appOnlyInstallGate = parseAccuraRegistrationQr(
		'https://signatura.example/app?handoffToken=abc123&app=ACCURA&challengeId=challenge-1&flowType=cross_device_qr',
	);
	assert.equal(appOnlyInstallGate.valid, true);
	assert.equal(
		appOnlyInstallGate.href,
		'/app?handoffToken=abc123&app=ACCURA&challengeId=challenge-1&flowType=cross_device_qr',
	);
	assert.equal(
		parseAccuraLoginQr(
			'https://signatura.example/register/accura?handoffToken=abc123&mode=register&source=accura&sourceApp=ACCURA',
		).valid,
		false,
	);
});

test('Signatura app approval QR parser accepts official ACCURA URL and JSON contracts', () => {
	const urlPayload = parseSignaturaAppApprovalQr(
		'https://signatura-sandbox.nouvoux.com/app-approval?challengeId=challenge-url-1&app=ACCURA&role=SYSTEM_ADMIN&flowType=cross_device_qr&callbackUrl=https%3A%2F%2Faccura-sandbox.nouvoux.com%2Fapi%2Fsignatura%2Fchallenge-approve',
	);
	assert.equal(urlPayload.valid, true);
	assert.equal(urlPayload.challengeId, 'challenge-url-1');
	assert.equal(urlPayload.app, 'ACCURA');
	assert.equal(urlPayload.requestedRole, 'SYSTEM_ADMIN');
	assert.equal(
		urlPayload.href,
		'/app-approval?challengeId=challenge-url-1&app=ACCURA&requestedRole=SYSTEM_ADMIN&flowType=cross_device_qr&callbackUrl=https%3A%2F%2Faccura-sandbox.nouvoux.com%2Fapi%2Fsignatura%2Fchallenge-approve',
	);

	const jsonPayload = parseSignaturaAppApprovalQr(
		JSON.stringify({
			type: 'SIGNATURA_APP_APPROVAL',
			version: 1,
			challengeId: 'challenge-json-1',
			app: 'ACCURA',
			requestedRole: 'SYSTEM_ADMIN',
			flowType: 'cross_device_qr',
			callbackUrl:
				'https://accura-sandbox.nouvoux.com/api/signatura/challenge-approve',
		}),
	);
	assert.equal(jsonPayload.valid, true);
	assert.equal(jsonPayload.challengeId, 'challenge-json-1');
	assert.equal(jsonPayload.callbackUrl, 'https://accura-sandbox.nouvoux.com/api/signatura/challenge-approve');
	assert.match(jsonPayload.href, /^\/app-approval\?/);
	assert.match(jsonPayload.href, /callbackUrl=/);
});

test('ACCURA QR parser rejects wrong app, missing pointers, and sensitive material', () => {
	assert.equal(
		parseAccuraLoginQr(
			'signatura://login/accura?challengeId=c1&shortCode=1&app=OTHER',
		).reason,
		'wrong_app',
	);
	assert.equal(
		parseAccuraLoginQr(
			'signatura://login/accura?shortCode=1&app=ACCURA',
		).reason,
		'missing_challenge',
	);
	assert.equal(
		parseAccuraLoginQr(
			'signatura://login/accura?challengeId=c1&app=ACCURA',
		).reason,
		'missing_short_code',
	);
	assert.equal(
		parseAccuraLoginQr(
			'signatura://login/accura?challengeId=c1&shortCode=1&app=ACCURA&recoveryPhrase=never',
		).reason,
		'sensitive_payload',
	);
	assert.equal(
		parseAccuraLoginQr(
			'https://signatura.example/wallet/scan-login?app=ACCURA&challengeId=c1&shortCode=1&data=seedPhrase',
		).reason,
		'sensitive_payload',
	);
});

test('ACCURA challenge lookup and approval use configured authenticated endpoints', async () => {
	const previous = {
		challenge: process.env.ACCURA_QR_CHALLENGE_URL,
		approve: process.env.ACCURA_QR_APPROVE_URL,
		clientId: process.env.ACCURA_CLIENT_ID,
		clientSecret: process.env.ACCURA_CLIENT_SECRET,
		approvalSecret: process.env.SIGNATURA_QR_APPROVAL_SECRET,
		approvalSecretMode: process.env.SIGNATURA_QR_APPROVAL_SECRET_MODE,
		fetch: globalThis.fetch,
		info: console.info,
	};
	process.env.ACCURA_QR_CHALLENGE_URL =
		'https://accura.example/api/auth/signatura/qr/challenge';
	process.env.ACCURA_QR_APPROVE_URL =
		'https://accura.example/api/auth/signatura/qr/approve';
	process.env.ACCURA_CLIENT_ID = 'accura';
	process.env.ACCURA_CLIENT_SECRET = 'shared-test-secret';
	process.env.SIGNATURA_QR_APPROVAL_SECRET = 'approval-secret-test';
	const calls = [];
	const logs = [];
	console.info = (...args) => logs.push(args);
	globalThis.fetch = async (url, options) => {
		calls.push({ url: String(url), options });
		if (options.method === 'GET') {
			return Response.json({
				app: 'ACCURA',
				challengeId: 'challenge-1',
				shortCode: 'AB12',
				status: 'PENDING',
				expiresAt: new Date(Date.now() + 90_000).toISOString(),
				browser: 'Chrome / Desktop',
				expectedRolePrefix: 'SADM',
				expectedSignaturaId: 'SIG-ACCURA-SADM-183791-4E18',
			});
		}
		return Response.json({ ok: true });
	};

	try {
		const challenge = await fetchAccuraQrLoginChallenge({
			challengeId: 'challenge-1',
			shortCode: 'AB12',
		});
		assert.equal(challenge.browser, 'Chrome / Desktop');
		assert.equal(challenge.expectedRolePrefix, 'SADM');
		assert.equal(
			challenge.expectedSignaturaId,
			'SIG-ACCURA-SADM-183791-4E18',
		);
		await postAccuraQrLoginApproval({
			app: 'ACCURA',
			challengeId: 'challenge-1',
		});
		assert.equal(calls.length, 2);
		assert.match(calls[0].url, /\/api\/signatura\/qr-login\/challenge/);
		assert.match(calls[1].url, /\/api\/signatura\/qr-login\/approve/);
		assert.match(calls[0].options.headers.Authorization, /^Basic /);
		assert.equal(
			calls[0].options.headers['X-Signatura-Approval-Secret'],
			'approval-secret-test',
		);
		assert.equal(calls[1].options.method, 'POST');
		assert.match(calls[1].options.headers.Authorization, /^Basic /);
		assert.equal(
			calls[1].options.headers['X-Signatura-Approval-Secret'],
			'approval-secret-test',
		);
		assert.match(calls[1].options.body, /"app":"ACCURA"/);
		assert.equal(logs[0][0], '[signatura.accura.qr_login.challenge.response]');
		assert.equal(logs[0][1].hasApprovalSecret, true);
		assert.equal(logs[0][1].sendingAuthorizationHeader, true);
		assert.equal(logs[0][1].sendingApprovalAuthorizationHeader, false);
		assert.equal(logs[0][1].sendingApprovalSecretHeader, true);
		assert.equal(logs[1][0], '[signatura.accura.qr_login.approval.sending]');
		assert.equal(logs[1][1].hasApprovalSecret, true);
		assert.equal(logs[1][1].sendingAuthorizationHeader, true);
		assert.equal(logs[1][1].sendingApprovalAuthorizationHeader, false);
		assert.equal(logs[1][1].sendingApprovalSecretHeader, true);
		assert.doesNotMatch(JSON.stringify(logs), /approval-secret-test/);
	} finally {
		globalThis.fetch = previous.fetch;
		console.info = previous.info;
		for (const [key, value] of Object.entries({
			ACCURA_QR_CHALLENGE_URL: previous.challenge,
			ACCURA_QR_APPROVE_URL: previous.approve,
			ACCURA_CLIENT_ID: previous.clientId,
			ACCURA_CLIENT_SECRET: previous.clientSecret,
			SIGNATURA_QR_APPROVAL_SECRET: previous.approvalSecret,
			SIGNATURA_QR_APPROVAL_SECRET_MODE: previous.approvalSecretMode,
		})) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
});

test('ACCURA QR lookup can send approval secret as bearer authorization', async () => {
	const previous = {
		challenge: process.env.ACCURA_QR_CHALLENGE_URL,
		clientId: process.env.ACCURA_CLIENT_ID,
		clientSecret: process.env.ACCURA_CLIENT_SECRET,
		approvalSecret: process.env.SIGNATURA_QR_APPROVAL_SECRET,
		approvalSecretMode: process.env.SIGNATURA_QR_APPROVAL_SECRET_MODE,
		fetch: globalThis.fetch,
		info: console.info,
	};
	process.env.ACCURA_QR_CHALLENGE_URL =
		'https://accura.example/api/auth/signatura/qr/challenge';
	process.env.ACCURA_CLIENT_ID = 'accura';
	process.env.ACCURA_CLIENT_SECRET = 'shared-test-secret';
	process.env.SIGNATURA_QR_APPROVAL_SECRET = 'approval-secret-test';
	process.env.SIGNATURA_QR_APPROVAL_SECRET_MODE = 'bearer';
	const calls = [];
	const logs = [];
	console.info = (...args) => logs.push(args);
	globalThis.fetch = async (url, options) => {
		calls.push({ url: String(url), options });
		return Response.json({
			app: 'ACCURA',
			challengeId: 'challenge-bearer-1',
			shortCode: 'ZX91',
			status: 'PENDING',
			expiresAt: new Date(Date.now() + 90_000).toISOString(),
		});
	};

	try {
		await fetchAccuraQrLoginChallenge({
			challengeId: 'challenge-bearer-1',
			shortCode: 'ZX91',
		});

		assert.equal(calls[0].options.headers.Authorization, 'Bearer approval-secret-test');
		assert.equal(calls[0].options.headers['X-Signatura-Approval-Secret'], undefined);
		assert.equal(logs[0][1].hasApprovalSecret, true);
		assert.equal(logs[0][1].approvalSecretMode, 'bearer');
		assert.equal(logs[0][1].sendingAuthorizationHeader, true);
		assert.equal(logs[0][1].sendingApprovalAuthorizationHeader, true);
		assert.equal(logs[0][1].sendingApprovalSecretHeader, false);
		assert.doesNotMatch(JSON.stringify(logs), /approval-secret-test/);
	} finally {
		globalThis.fetch = previous.fetch;
		console.info = previous.info;
		for (const [key, value] of Object.entries({
			ACCURA_QR_CHALLENGE_URL: previous.challenge,
			ACCURA_CLIENT_ID: previous.clientId,
			ACCURA_CLIENT_SECRET: previous.clientSecret,
			SIGNATURA_QR_APPROVAL_SECRET: previous.approvalSecret,
			SIGNATURA_QR_APPROVAL_SECRET_MODE: previous.approvalSecretMode,
		})) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
});

test('ACCURA QR lookup can use separate basic auth for nginx protected endpoints', async () => {
	const previous = {
		challenge: process.env.ACCURA_QR_CHALLENGE_URL,
		clientId: process.env.ACCURA_CLIENT_ID,
		clientSecret: process.env.ACCURA_CLIENT_SECRET,
		approvalSecret: process.env.SIGNATURA_QR_APPROVAL_SECRET,
		approvalSecretMode: process.env.SIGNATURA_QR_APPROVAL_SECRET_MODE,
		basicUser: process.env.ACCURA_QR_BASIC_USER,
		basicPassword: process.env.ACCURA_QR_BASIC_PASSWORD,
		fetch: globalThis.fetch,
		info: console.info,
	};
	process.env.ACCURA_QR_CHALLENGE_URL =
		'https://accura.example/api/signatura/qr-login/challenge';
	process.env.ACCURA_CLIENT_ID = 'accura';
	process.env.ACCURA_CLIENT_SECRET = 'shared-test-secret';
	process.env.SIGNATURA_QR_APPROVAL_SECRET = 'approval-secret-test';
	process.env.SIGNATURA_QR_APPROVAL_SECRET_MODE = 'header';
	process.env.ACCURA_QR_BASIC_USER = 'sandbox-user';
	process.env.ACCURA_QR_BASIC_PASSWORD = 'sandbox-pass';
	const calls = [];
	const logs = [];
	console.info = (...args) => logs.push(args);
	globalThis.fetch = async (url, options) => {
		calls.push({ url: String(url), options });
		return Response.json({
			app: 'ACCURA',
			challengeId: 'challenge-basic-1',
			shortCode: 'BN91',
			status: 'PENDING',
			expiresAt: new Date(Date.now() + 90_000).toISOString(),
		});
	};

	try {
		await fetchAccuraQrLoginChallenge({
			challengeId: 'challenge-basic-1',
			shortCode: 'BN91',
		});

		assert.equal(
			calls[0].options.headers.Authorization,
			`Basic ${Buffer.from('sandbox-user:sandbox-pass').toString('base64')}`,
		);
		assert.equal(
			calls[0].options.headers['X-Signatura-Approval-Secret'],
			'approval-secret-test',
		);
		assert.equal(logs[0][1].sendingAuthorizationHeader, true);
		assert.equal(logs[0][1].sendingApprovalAuthorizationHeader, false);
		assert.equal(logs[0][1].sendingHttpAuthHeader, true);
		assert.equal(logs[0][1].httpAuthSource, 'basic');
		assert.doesNotMatch(JSON.stringify(logs), /sandbox-pass|approval-secret-test/);
	} finally {
		globalThis.fetch = previous.fetch;
		console.info = previous.info;
		for (const [key, value] of Object.entries({
			ACCURA_QR_CHALLENGE_URL: previous.challenge,
			ACCURA_CLIENT_ID: previous.clientId,
			ACCURA_CLIENT_SECRET: previous.clientSecret,
			SIGNATURA_QR_APPROVAL_SECRET: previous.approvalSecret,
			SIGNATURA_QR_APPROVAL_SECRET_MODE: previous.approvalSecretMode,
			ACCURA_QR_BASIC_USER: previous.basicUser,
			ACCURA_QR_BASIC_PASSWORD: previous.basicPassword,
		})) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
});

test('ACCURA QR login UI and API remain separate from registration and session creation', async () => {
	const scanner = await readFile(
		new URL('../src/components/QrCodeScanner.js', import.meta.url),
		'utf8',
	);
	const approval = await readFile(
		new URL('../src/components/AccuraQrLoginApprovalForm.js', import.meta.url),
		'utf8',
	);
	const scanPage = await readFile(
		new URL('../src/app/signatura/scan-login/page.js', import.meta.url),
		'utf8',
	);
	const canonicalApprovalPage = await readFile(
		new URL(
			'../src/app/signatura/approve-accura-login/page.js',
			import.meta.url,
		),
		'utf8',
	);
	const approveRoute = await readFile(
		new URL(
			'../src/app/api/signatura/accura/qr-login/approve/route.js',
			import.meta.url,
		),
		'utf8',
	);
	const registerRoute = await readFile(
		new URL('../src/app/api/auth/register/account/route.ts', import.meta.url),
		'utf8',
	);
	const portalRoutes = await readFile(
		new URL('../config/portalRoutes.mjs', import.meta.url),
		'utf8',
	);

	assert.match(scanner, /parseAccuraLoginQr/);
	assert.match(scanPage, /wallet\/scan-login\/page/);
	assert.match(canonicalApprovalPage, /wallet\/approve-accura-login\/page/);
	assert.match(
		portalRoutes,
		/\/wallet\/approve-accura-login[\s\S]+\/signatura\/approve-accura-login/,
	);
	assert.match(approval, /Choose ACCURA Role/);
	assert.match(approval, /Approve with Passkey/);
	assert.match(approval, /All authorized ACCURA roles linked to this identity/);
	assert.doesNotMatch(approval, /Use another Signatura ID/);
	assert.doesNotMatch(approval, /switch to your SADM Signatura ID/);
	assert.match(approval, /expectedSignaturaId/);
	assert.match(approveRoute, /postAccuraQrLoginApproval/);
	assert.match(approveRoute, /expectedRolePrefix/);
	assert.match(approveRoute, /requireActiveAccuraWalletAccount/);
	assert.match(approveRoute, /trustedDevice/);
	assert.doesNotMatch(approveRoute, /setSessionCookie|createAuthenticatedLoginResponse/);
	assert.doesNotMatch(registerRoute, /accura_qr_login/);
});
