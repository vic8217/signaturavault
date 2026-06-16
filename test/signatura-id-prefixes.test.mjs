import assert from 'node:assert/strict';
import test from 'node:test';

import {
	SIGNATURA_ACCOUNT_TYPES,
	generateAccuraSignaturaId,
	generateSignaturaId,
	getSignaturaAccountType,
	normalizeSignaturaId,
} from '../src/lib/identity.js';

test('generated Signatura IDs use role-aware prefixes', () => {
	assert.match(generateSignaturaId('user'), /^SIG-U-[0-9A-F]{4}-[0-9A-F]{4}$/);
	assert.match(generateSignaturaId('issuer'), /^SIG-I-[0-9A-F]{4}-[0-9A-F]{4}$/);
	assert.match(generateSignaturaId('admin'), /^SIG-A-[0-9A-F]{4}-[0-9A-F]{4}$/);
});

test('generated ACCURA Signatura IDs include app role scope', () => {
	assert.match(
		generateAccuraSignaturaId('ROAD-0F7C99', 'INVT'),
		/^SIG-ACCURA-ROAD-0F7C99-INVT-[0-9A-F]{6}-[0-9A-F]{4}$/,
	);
	assert.match(
		generateAccuraSignaturaId('', 'SADM'),
		/^SIG-ACCURA-SADM-[0-9A-F]{6}-[0-9A-F]{4}$/,
	);
	assert.match(
		generateAccuraSignaturaId('ROAD', 'CADM'),
		/^SIG-ACCURA-ROAD-CADM-[0-9A-F]{6}-[0-9A-F]{4}$/,
	);
	assert.match(
		generateAccuraSignaturaId('ROAD', 'PAYR'),
		/^SIG-ACCURA-ROAD-PAYR-[0-9A-F]{6}-[0-9A-F]{4}$/,
	);
});

test('Signatura ID account type can be inferred from prefix', () => {
	assert.equal(getSignaturaAccountType('SIG-U-1234-ABCD'), SIGNATURA_ACCOUNT_TYPES.DOCUMENT_OWNER);
	assert.equal(getSignaturaAccountType('SIG-I-1234-ABCD'), SIGNATURA_ACCOUNT_TYPES.ISSUER);
	assert.equal(getSignaturaAccountType('SIG-A-1234-ABCD'), SIGNATURA_ACCOUNT_TYPES.ADMIN);
	assert.equal(getSignaturaAccountType('SIG-LEGACY'), SIGNATURA_ACCOUNT_TYPES.DOCUMENT_OWNER);
});

test('normalization preserves prefixed IDs and supports legacy shorthand', () => {
	assert.equal(normalizeSignaturaId('sig-i-1234-abcd'), 'SIG-I-1234-ABCD');
	assert.equal(normalizeSignaturaId('8fd2a91c'), 'SIG-8FD2A91C');
});
