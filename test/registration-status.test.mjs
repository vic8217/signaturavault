import assert from 'node:assert/strict';
import test from 'node:test';
import {
	REGISTRATION_STATUSES,
	currentRegistrationStep,
} from '../src/lib/registration-status.ts';

test('pending onboarding status wins over stale trust level 2', () => {
	assert.equal(
		currentRegistrationStep({
			accountStatus: REGISTRATION_STATUSES.PASSKEY_CREATED,
			trustLevel: 2,
		}),
		REGISTRATION_STATUSES.PASSKEY_CREATED,
	);
	assert.equal(
		currentRegistrationStep({
			accountStatus: REGISTRATION_STATUSES.PENDING_TRUSTED_DEVICE_REGISTRATION,
			trustLevel: 2,
		}),
		REGISTRATION_STATUSES.PENDING_TRUSTED_DEVICE_REGISTRATION,
	);
});

test('active account with trust level 2 is completed', () => {
	assert.equal(
		currentRegistrationStep({
			accountStatus: 'active',
			trustLevel: 2,
		}),
		REGISTRATION_STATUSES.COMPLETED,
	);
});
