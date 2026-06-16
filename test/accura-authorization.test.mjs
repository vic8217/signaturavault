import assert from 'node:assert/strict';
import test from 'node:test';

import {
	accuraMetadataAllowsAction,
	decodeAccuraUnlockToken,
	isCriticalAccuraAction,
	isAllowedAccuraAuthorizationSource,
	isAllowedAccuraClientId,
	isAllowedAccuraRolePrefix,
	isKnownAccuraSensitiveAction,
	issueAccuraUnlockToken,
	verifyAccuraUnlockToken,
} from '@/lib/accuraAuthorization.js';

test('ACCURA authorization accepts configured admin source and SADM role', () => {
	const previousClientId = process.env.ACCURA_CLIENT_ID;
	process.env.ACCURA_CLIENT_ID = 'accura';

	try {
		assert.equal(isAllowedAccuraClientId('accura'), true);
		assert.equal(isAllowedAccuraAuthorizationSource('accura-admin'), true);
		assert.equal(isAllowedAccuraRolePrefix('SADM'), true);
	} finally {
		if (previousClientId === undefined) delete process.env.ACCURA_CLIENT_ID;
		else process.env.ACCURA_CLIENT_ID = previousClientId;
	}
});

test('ACCURA authorization rejects unknown source and role', () => {
	assert.equal(isAllowedAccuraAuthorizationSource('accura-public'), false);
	assert.equal(isAllowedAccuraRolePrefix('ROOT'), false);
});

test('ACCURA action policy recognizes sensitive and critical actions', () => {
	assert.equal(
		isKnownAccuraSensitiveAction({
			module: 'cash payments',
			action: 'release payment',
		}),
		true,
	);
	assert.equal(
		isKnownAccuraSensitiveAction({
			module: 'inventory',
			action: 'view dashboard',
		}),
		false,
	);
	assert.equal(isCriticalAccuraAction('mass export'), true);
});

test('ACCURA metadata allows only scoped modules and permissions', () => {
	const link = {
		sourceApp: 'ACCURA',
		status: 'ACTIVE',
		rolePrefix: 'CASH',
		moduleAccess: ['CASH_PAYMENTS'],
		permissionSet: ['CASH_PAYMENTS:RELEASE_PAYMENT'],
		trustedDeviceStatus: 'TRUSTED',
	};

	assert.equal(
		accuraMetadataAllowsAction(link, {
			module: 'CASH_PAYMENTS',
			action: 'RELEASE_PAYMENT',
		}),
		true,
	);
	assert.equal(
		accuraMetadataAllowsAction(link, {
			module: 'PAYROLL',
			action: 'APPROVE_PAYROLL',
		}),
		false,
	);
});

test('ACCURA unlock tokens are signed, scoped, and time-bound', () => {
	const previousSecret = process.env.ACCURA_UNLOCK_TOKEN_SECRET;
	process.env.ACCURA_UNLOCK_TOKEN_SECRET = 'test-unlock-secret';
	try {
		const issued = issueAccuraUnlockToken({
			signaturaId: 'SIG-U-TEST',
			userId: 'user-1',
			accuraUserId: 'accura-user-1',
			companyCode: 'ROAD-0F7C99',
			companyId: 'company-1',
			tenantId: 'tenant-1',
			module: 'REPORTS',
			action: 'MASS_EXPORT',
			resourceId: 'export-1',
			deviceId: 'device-1',
			sessionId: 'session-1',
			ttlSeconds: 60,
		});

		const decoded = decodeAccuraUnlockToken(issued.token);
		assert.equal(decoded.valid, true);
		assert.equal(decoded.payload.action, 'MASS_EXPORT');

		assert.equal(
			verifyAccuraUnlockToken(issued.token, {
				signaturaId: 'SIG-U-TEST',
				tenantId: 'tenant-1',
				module: 'REPORTS',
				action: 'MASS_EXPORT',
				deviceId: 'device-1',
				sessionId: 'session-1',
			}).valid,
			true,
		);
		assert.equal(
			verifyAccuraUnlockToken(issued.token, {
				tenantId: 'other-tenant',
				module: 'REPORTS',
				action: 'MASS_EXPORT',
			}).reason,
			'scope_mismatch',
		);
	} finally {
		if (previousSecret === undefined) delete process.env.ACCURA_UNLOCK_TOKEN_SECRET;
		else process.env.ACCURA_UNLOCK_TOKEN_SECRET = previousSecret;
	}
});
