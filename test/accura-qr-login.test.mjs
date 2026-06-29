import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
	buildAccuraQrApprovalPath,
	parseAccuraLoginQr,
	parseAccuraRegistrationQr,
} from '@/lib/accuraQrPayload.js';
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
		fetch: globalThis.fetch,
	};
	process.env.ACCURA_QR_CHALLENGE_URL =
		'https://accura.example/api/auth/signatura/qr/challenge';
	process.env.ACCURA_QR_APPROVE_URL =
		'https://accura.example/api/auth/signatura/qr/approve';
	process.env.ACCURA_CLIENT_ID = 'accura';
	process.env.ACCURA_CLIENT_SECRET = 'shared-test-secret';
	const calls = [];
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
		assert.match(calls[0].options.headers.Authorization, /^Basic /);
		assert.equal(calls[1].options.method, 'POST');
		assert.match(calls[1].options.body, /"app":"ACCURA"/);
	} finally {
		globalThis.fetch = previous.fetch;
		for (const [key, value] of Object.entries({
			ACCURA_QR_CHALLENGE_URL: previous.challenge,
			ACCURA_QR_APPROVE_URL: previous.approve,
			ACCURA_CLIENT_ID: previous.clientId,
			ACCURA_CLIENT_SECRET: previous.clientSecret,
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
