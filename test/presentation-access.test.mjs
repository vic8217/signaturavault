import assert from 'node:assert/strict';
import { stat, readFile } from 'node:fs/promises';
import test from 'node:test';

test('presentation access uses hashed tokens and server-side validation', async () => {
	const accessLib = await readFile(
		new URL('../src/lib/presentation-access.js', import.meta.url),
		'utf8',
	);
	const page = await readFile(
		new URL('../src/app/presentation/signatura-issuers/page.js', import.meta.url),
		'utf8',
	);
	const validationApi = await readFile(
		new URL(
			'../src/app/api/presentations/signatura-issuers/access/route.js',
			import.meta.url,
		),
		'utf8',
	);

	assert.match(accessLib, /crypto\.randomBytes\(32\)/);
	assert.match(accessLib, /createHash\('sha256'\)/);
	assert.match(accessLib, /createCipheriv\('aes-256-gcm'/);
	assert.match(accessLib, /tokenCipher: encryptPresentationToken\(token\)/);
	assert.match(accessLib, /shareUrl/);
	assert.match(accessLib, /resolvePublicSignaturaOrigin/);
	assert.doesNotMatch(accessLib, /new URL\('\/presentation\/signatura-issuers', req\.url\)/);
	assert.match(accessLib, /presentationAccessView\.create/);
	assert.match(accessLib, /viewCount: \{ increment: 1 \}/);
	assert.match(accessLib, /Presentation link expired or invalid\./);
	assert.match(page, /validatePresentationAccess/);
	assert.match(page, /incrementView: true/);
	assert.match(validationApi, /incrementView: false/);
});

test('admin presentation generator requires admin access and never returns stored token hashes', async () => {
	const adminApi = await readFile(
		new URL(
			'../src/app/api/admin/presentations/signatura-issuers/access-links/route.js',
			import.meta.url,
		),
		'utf8',
	);
	const revokeApi = await readFile(
		new URL(
			'../src/app/api/admin/presentations/signatura-issuers/access-links/[id]/route.js',
			import.meta.url,
		),
		'utf8',
	);
	const adminPage = await readFile(
		new URL(
			'../src/app/admin/presentations/signatura-issuers/page.js',
			import.meta.url,
		),
		'utf8',
	);

	assert.match(adminApi, /requireAdminRequest/);
	assert.match(revokeApi, /requireAdminRequest/);
	assert.match(adminApi, /publicPresentationLink/);
	assert.doesNotMatch(adminPage, /tokenHash/);
	assert.match(adminPage, /Generate access token/);
	assert.match(adminPage, /const form = event\.currentTarget/);
	assert.match(adminPage, /form\.reset\(\)/);
	assert.match(adminPage, /Share link/);
	assert.match(adminPage, /copyShareUrl/);
	assert.match(adminPage, /Revoke/);
});

test('issuer presentation has exactly fifteen expected PNG slide assets', async () => {
	for (let index = 1; index <= 15; index += 1) {
		const number = String(index).padStart(2, '0');
		const slide = new URL(
			`../public/presentations/signatura-issuers/slide-${number}.png`,
			import.meta.url,
		);
		const metadata = await stat(slide);
		assert.ok(metadata.size > 0, `slide-${number}.png should not be empty`);
	}
});
