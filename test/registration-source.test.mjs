import assert from 'node:assert/strict';
import test from 'node:test';

import {
	ACCURA_ROLE_PREFIXES,
	normalizeCompanyCode,
	normalizeRegistrationSource,
	registrationContextFromParams,
	resolveAccuraAuthorizationRolePrefix,
	rolePrefixFromAccuraSignaturaId,
	sourceAppLabel,
	validateAccuraRegistrationContext,
} from '@/lib/registrationSource.js';

test('registration source accepts known app origins', () => {
	assert.deepEqual(normalizeRegistrationSource('accura'), {
		source: 'accura',
		error: '',
	});
	assert.deepEqual(normalizeRegistrationSource('haven'), {
		source: 'haven',
		error: '',
	});
	assert.deepEqual(normalizeRegistrationSource('issuer'), {
		source: 'issuer',
		error: '',
	});
});

test('registration source rejects unknown sources', () => {
	assert.deepEqual(normalizeRegistrationSource('unknown-app'), {
		source: '',
		error: 'Unknown registration source',
	});
});

test('ACCURA registration context normalizes company metadata', () => {
	const context = registrationContextFromParams({
		source: 'ACCURA',
		companyCode: ' road-0f7c99!! ',
		companyName: ' RoadRunner BeepBeep ',
		role: 'Inventory Clerk',
		rolePrefix: ' invt ',
	});

	assert.equal(context.source, 'accura');
	assert.equal(context.companyCode, 'ROAD-0F7C99');
	assert.equal(context.companyName, 'RoadRunner BeepBeep');
	assert.equal(context.role, 'inventory_clerk');
	assert.equal(context.rolePrefix, 'INVT');
	assert.equal(normalizeCompanyCode(' road 123 '), 'ROAD123');
	assert.equal(sourceAppLabel('accura'), 'ACCURA');
});

test('ACCURA registration context requires a valid company role and return URL', () => {
	const context = registrationContextFromParams({
		source: 'accura',
		companyId: 'company-road',
		companyCode: 'ROAD-0F7C99',
		companyName: 'RoadRunner BeepBeep',
		role: 'inventory_clerk',
		rolePrefix: 'INVT',
	});

	assert.equal(ACCURA_ROLE_PREFIXES.INVT, 'Inventory Clerk');
	assert.equal(
		validateAccuraRegistrationContext(context, {
			returnUrl: 'http://localhost:3001/accura/register/callback',
		}),
		'',
	);
	assert.equal(
		validateAccuraRegistrationContext(
			{ ...context, rolePrefix: 'NOPE' },
			{ returnUrl: 'http://localhost:3001/accura/register/callback' },
		),
		'Invalid ACCURA registration context.',
	);
	assert.equal(
		validateAccuraRegistrationContext(context, { returnUrl: '' }),
		'Invalid ACCURA registration context.',
	);
});

test('ACCURA system admin context does not require company code', () => {
	const context = registrationContextFromParams({
		source: 'accura',
		companyId: 'company-road',
		role: 'system_admin',
		rolePrefix: 'SADM',
	});

	assert.equal(
		validateAccuraRegistrationContext(context, {
			returnUrl: 'http://localhost:3001/accura/register/callback',
		}),
		'',
	);
});

test('ACCURA authorization role prefix is derived from Signatura ID', () => {
	const signaturaId = 'SIG-ACCURA-ROAD-9B2D7B-CASH-789BD6-4411';
	assert.equal(rolePrefixFromAccuraSignaturaId(signaturaId), 'CASH');
	assert.equal(
		resolveAccuraAuthorizationRolePrefix('CADM', signaturaId),
		'CASH',
	);
});

test('ACCURA role prefixes include staff and admin roles', () => {
	for (const prefix of [
		'SADM',
		'CADM',
		'UADM',
		'CASH',
		'SALE',
		'INVT',
		'ACCT',
		'BOOK',
		'APCL',
		'ARCL',
		'PAYR',
		'PROC',
		'MFGC',
		'CRMS',
		'SRMS',
		'BRMG',
		'SUPV',
		'AUDT',
	]) {
		assert.ok(ACCURA_ROLE_PREFIXES[prefix], `${prefix} should be supported`);
	}
});
