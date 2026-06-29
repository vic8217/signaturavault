import assert from 'node:assert/strict';
import test from 'node:test';

import {
	accuraHandoffFromSearchParams,
	buildAccuraMobileInstallPath,
	buildAccuraRegisterPath,
} from '@/lib/accuraRegistrationEntry.js';

test('ACCURA mobile onboarding paths preserve handoff token', () => {
	assert.equal(
		buildAccuraMobileInstallPath('token-1'),
		'/app?handoffToken=token-1&source=accura&sourceApp=ACCURA',
	);
	assert.equal(
		buildAccuraRegisterPath('token-1'),
		'/register/accura?handoffToken=token-1&mode=register&source=accura&sourceApp=ACCURA',
	);
	const accura = accuraHandoffFromSearchParams({
		handoffToken: 'token-1',
		source: 'accura',
	});
	assert.equal(accura.handoffToken, 'token-1');
	assert.equal(accura.registerPath, buildAccuraRegisterPath('token-1'));
	assert.match(accura.loginPath, /^\/login\?next=/);
});

test('ACCURA mobile onboarding paths preserve QR approval challenge context', () => {
	const registerPath = buildAccuraRegisterPath('token-1', {
		challengeId: '5df3f640-e989-44ac-aa63-df805594ea83',
		app: 'ACCURA',
		flowType: 'cross_device_qr',
		originDevice: 'desktop',
	});
	assert.equal(
		registerPath,
		'/register/accura?handoffToken=token-1&mode=register&source=accura&sourceApp=ACCURA&challengeId=5df3f640-e989-44ac-aa63-df805594ea83&flowType=cross_device_qr&originDevice=desktop&app=ACCURA',
	);

	const installPath = buildAccuraMobileInstallPath('token-1', {
		challengeId: '5df3f640-e989-44ac-aa63-df805594ea83',
		app: 'ACCURA',
		flowType: 'cross_device_qr',
	});
	assert.equal(
		installPath,
		'/app?handoffToken=token-1&source=accura&sourceApp=ACCURA&challengeId=5df3f640-e989-44ac-aa63-df805594ea83&flowType=cross_device_qr&app=ACCURA',
	);

	const accura = accuraHandoffFromSearchParams({
		handoffToken: 'token-1',
		app: 'ACCURA',
		challengeId: '5df3f640-e989-44ac-aa63-df805594ea83',
		flowType: 'cross_device_qr',
	});
	assert.equal(accura.handoffToken, 'token-1');
	assert.match(accura.registerPath, /challengeId=5df3f640-e989-44ac-aa63-df805594ea83/);
	assert.match(accura.registerPath, /flowType=cross_device_qr/);
	assert.match(decodeURIComponent(accura.loginPath), /\/register\/accura\?/);
});
