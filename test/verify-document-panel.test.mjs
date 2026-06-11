import test from 'node:test';
import assert from 'node:assert/strict';

import { extractTokenFromInput } from '../src/lib/verify-token.js';

test('extractTokenFromInput returns plain verification tokens', () => {
	assert.equal(extractTokenFromInput('VER-DEMO-TOKEN-001'), 'VER-DEMO-TOKEN-001');
});

test('extractTokenFromInput reads token query param from verify URLs', () => {
	assert.equal(
		extractTokenFromInput('https://signatura.local/verify?token=QR-DEMO-001'),
		'QR-DEMO-001',
	);
});

test('extractTokenFromInput reads token from verify API path', () => {
	assert.equal(
		extractTokenFromInput('https://signatura.local/api/verify/VER-PATH-TOKEN'),
		'VER-PATH-TOKEN',
	);
});
