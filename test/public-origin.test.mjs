import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
	assertPhoneReachableSignaturaOrigin,
	resolvePublicSignaturaOrigin,
} from '@/lib/publicOrigin.ts';

function request(host, proto = 'http') {
	return new Request(`http://${host}/api/test`, {
		headers: {
			host,
			'x-forwarded-proto': proto,
		},
	});
}

test('resolvePublicSignaturaOrigin uses configured public URL when desktop is localhost', () => {
	const previous = process.env.SIGNATURA_PUBLIC_URL;
	process.env.SIGNATURA_PUBLIC_URL =
		'https://juiciness-demeanor-december.ngrok-free.dev';
	try {
		assert.equal(
			resolvePublicSignaturaOrigin(request('localhost:3000')),
			'https://juiciness-demeanor-december.ngrok-free.dev',
		);
	} finally {
		if (previous === undefined) {
			delete process.env.SIGNATURA_PUBLIC_URL;
		} else {
			process.env.SIGNATURA_PUBLIC_URL = previous;
		}
	}
});

test('resolvePublicSignaturaOrigin uses configured public URL when desktop binds 0.0.0.0', () => {
	const previous = process.env.SIGNATURA_PUBLIC_URL;
	process.env.SIGNATURA_PUBLIC_URL =
		'https://juiciness-demeanor-december.ngrok-free.dev';
	try {
		assert.equal(
			resolvePublicSignaturaOrigin(request('0.0.0.0:3000')),
			'https://juiciness-demeanor-december.ngrok-free.dev',
		);
	} finally {
		if (previous === undefined) {
			delete process.env.SIGNATURA_PUBLIC_URL;
		} else {
			process.env.SIGNATURA_PUBLIC_URL = previous;
		}
	}
});

test('resolvePublicSignaturaOrigin uses configured public URL for LAN desktop hosts', () => {
	const previous = process.env.SIGNATURA_PUBLIC_URL;
	process.env.SIGNATURA_PUBLIC_URL =
		'https://juiciness-demeanor-december.ngrok-free.dev';
	try {
		assert.equal(
			resolvePublicSignaturaOrigin(request('192.168.68.139:3000')),
			'https://juiciness-demeanor-december.ngrok-free.dev',
		);
	} finally {
		if (previous === undefined) {
			delete process.env.SIGNATURA_PUBLIC_URL;
		} else {
			process.env.SIGNATURA_PUBLIC_URL = previous;
		}
	}
});

test('assertPhoneReachableSignaturaOrigin rejects localhost QR origins', () => {
	const previous = process.env.SIGNATURA_PUBLIC_URL;
	delete process.env.SIGNATURA_PUBLIC_URL;
	delete process.env.NEXT_PUBLIC_SIGNATURA_PUBLIC_URL;
	try {
		assert.throws(
			() => assertPhoneReachableSignaturaOrigin(request('localhost:3000')),
			/Phone QR codes cannot use localhost/i,
		);
	} finally {
		if (previous === undefined) {
			delete process.env.SIGNATURA_PUBLIC_URL;
		} else {
			process.env.SIGNATURA_PUBLIC_URL = previous;
		}
	}
});

test('logout redirects account switching through the public Signatura origin', async () => {
	const source = await readFile(
		new URL('../src/app/api/auth/logout/route.ts', import.meta.url),
		'utf8',
	);

	assert.doesNotMatch(source, /resolvePublicSignaturaOrigin/);
	assert.match(source, /new URL\(redirectTo, req\.url\)/);
	assert.match(source, /NextResponse\.redirect/);
});
