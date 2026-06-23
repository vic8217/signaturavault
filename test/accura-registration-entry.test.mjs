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
