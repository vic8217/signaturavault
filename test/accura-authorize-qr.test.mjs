import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('ACCURA authorize form requires enrolled trusted-device QR approval', async () => {
	const source = await readFile(
		new URL('../src/components/SignaturaAuthorizeForm.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /LoginTrustedDeviceQrPanel/);
	assert.match(source, /\/api\/auth\/login\/authorize\/start/);
	assert.doesNotMatch(source, /startAuthentication/);
	assert.doesNotMatch(source, /\/api\/auth\/login\/authorize\/finish/);
	assert.match(source, /phones cannot authorize ACCURA login/);
});

test('trusted device QR panel preserves ACCURA assertion until introspection', async () => {
	const source = await readFile(
		new URL('../src/components/LoginTrustedDeviceQrPanel.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /completeExternalReturn/);
	assert.match(source, /if \(externalReturnUrl\)/);
	assert.match(source, /Generic QR scanners on unregistered phones cannot approve/);
	const approvedBlock = source.slice(
		source.indexOf("if (body.status === 'APPROVED')"),
		source.indexOf('if (body.status === \'EXPIRED\''),
	);
	assert.match(approvedBlock, /if \(externalReturnUrl\)/);
	assert.ok(
		approvedBlock.indexOf('completeExternalReturn') <
			approvedBlock.indexOf("remote/finish"),
		'external ACCURA return should happen before remote finish consumes the challenge',
	);
});
