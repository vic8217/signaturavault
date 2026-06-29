import assert from 'node:assert/strict';
import test from 'node:test';

import { POST as approveChallenge } from '@/app/api/signatura/challenge-approve/route.ts';
import { GET as getChallengeStatus } from '@/app/api/signatura/challenge-status/route.ts';
import { prisma, resetHarness } from './harness/state.mjs';

function request(challengeId) {
	return new Request(
		`https://signatura.test/api/signatura/challenge-status?challengeId=${encodeURIComponent(challengeId)}`,
	);
}

function approveRequest(body) {
	return new Request('https://signatura.test/api/signatura/challenge-approve', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

test('ACCURA laptop can poll approved Signatura registration challenge', async () => {
	resetHarness({
		accuraRegistrationHandoff: [
			{
				id: 'handoff-approved-1',
				tokenId: 'token-approved-1',
				challengeId: 'challenge-approved-1',
				registrationKeyId: 'platform-system-admin',
				companyId: 'accura-platform',
				companyCode: 'ACCURA',
				roleCode: 'SADM',
				returnUrl: 'https://accura.test/register/callback',
				originDevice: 'desktop',
				flowType: 'cross_device_qr',
				status: 'APPROVED',
				userId: 'user-approved-1',
				signaturaId: 'SIG-U-B64A-3A1A',
				verificationToken: 'verification-token-1',
				expiresAt: new Date(Date.now() + 5 * 60 * 1000),
				approvedAt: new Date('2026-06-29T00:00:00.000Z'),
				createdAt: new Date(),
			},
		],
	});

	const response = await getChallengeStatus(request('challenge-approved-1'));
	const body = await response.json();

	assert.equal(response.status, 200);
	assert.equal(body.status, 'APPROVED');
	assert.equal(body.signaturaId, 'SIG-U-B64A-3A1A');
	assert.equal(body.verificationToken, 'verification-token-1');
	assert.equal(body.flowType, 'cross_device_qr');
	assert.equal(body.originDevice, 'desktop');
	assert.equal(body.approvedAt, '2026-06-29T00:00:00.000Z');
});

test('ACCURA challenge approval callback updates exact polled challenge record', async () => {
	resetHarness({
		accuraRegistrationHandoff: [
			{
				id: 'handoff-callback-1',
				tokenId: 'token-callback-1',
				challengeId: '6cc232f4-0a1d-43b1-9ba1-58fbf416ff92',
				registrationKeyId: 'platform-system-admin',
				companyId: 'accura-platform',
				companyCode: 'ACCURA',
				roleCode: 'SADM',
				returnUrl: 'https://accura-sandbox.nouvoux.com/register/callback',
				originDevice: 'desktop',
				flowType: 'cross_device_qr',
				status: 'CLAIMED',
				expiresAt: new Date(Date.now() + 5 * 60 * 1000),
				createdAt: new Date(),
			},
		],
	});

	const approve = await approveChallenge(
		approveRequest({
			challengeId: '6cc232f4-0a1d-43b1-9ba1-58fbf416ff92',
			signaturaId: 'SIG-U-B64A-3A1A',
			status: 'APPROVED',
			verificationToken: 'verification-token-callback',
		}),
	);
	const approveBody = await approve.json();

	assert.equal(approve.status, 200);
	assert.equal(approveBody.status, 'APPROVED');
	assert.equal(approveBody.challengeId, '6cc232f4-0a1d-43b1-9ba1-58fbf416ff92');

	const polled = await getChallengeStatus(
		request('6cc232f4-0a1d-43b1-9ba1-58fbf416ff92'),
	);
	const polledBody = await polled.json();

	assert.equal(polled.status, 200);
	assert.equal(polledBody.status, 'APPROVED');
	assert.equal(polledBody.signaturaId, 'SIG-U-B64A-3A1A');
	assert.equal(polledBody.verificationToken, 'verification-token-callback');
	assert.equal(
		prisma.accuraRegistrationHandoff.__rows[0].challengeId,
		'6cc232f4-0a1d-43b1-9ba1-58fbf416ff92',
	);
});

test('ACCURA challenge polling hides tokens until approval and expires old challenges', async () => {
	resetHarness({
		accuraRegistrationHandoff: [
			{
				id: 'handoff-pending-1',
				tokenId: 'token-pending-1',
				challengeId: 'challenge-pending-1',
				registrationKeyId: 'key-pending',
				companyId: 'company-pending',
				companyCode: 'PENDING',
				roleCode: 'CADM',
				returnUrl: 'https://accura.test/register/callback',
				originDevice: 'desktop',
				flowType: 'cross_device_qr',
				status: 'CLAIMED',
				expiresAt: new Date(Date.now() + 5 * 60 * 1000),
				createdAt: new Date(),
			},
			{
				id: 'handoff-expired-1',
				tokenId: 'token-expired-1',
				challengeId: 'challenge-expired-1',
				registrationKeyId: 'key-expired',
				companyId: 'company-expired',
				companyCode: 'EXPIRED',
				roleCode: 'CADM',
				returnUrl: 'https://accura.test/register/callback',
				status: 'CLAIMED',
				expiresAt: new Date(Date.now() - 1000),
				createdAt: new Date(),
			},
		],
	});

	const pending = await getChallengeStatus(request('challenge-pending-1'));
	const pendingBody = await pending.json();
	assert.equal(pendingBody.status, 'PENDING');
	assert.equal(pendingBody.signaturaId, null);
	assert.equal(pendingBody.verificationToken, null);

	const expired = await getChallengeStatus(request('challenge-expired-1'));
	const expiredBody = await expired.json();
	assert.equal(expiredBody.status, 'EXPIRED');
	assert.equal(expiredBody.verificationToken, null);

	const missing = await getChallengeStatus(request('missing-challenge'));
	const missingBody = await missing.json();
	assert.equal(missingBody.status, 'PENDING');
});
