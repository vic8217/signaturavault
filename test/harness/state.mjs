import crypto from 'node:crypto';

import { createFakePrisma } from './fake-prisma.mjs';

const SESSION_SECRET =
	process.env.SESSION_SECRET ||
	process.env.AUTH_SECRET ||
	'development-only-session-secret-change-me';

function base64url(input) {
	return Buffer.from(input).toString('base64url');
}

function sign(value) {
	return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

export function makeSessionCookie(payload) {
	const body = base64url(JSON.stringify(payload));
	return `${body}.${sign(body)}`;
}

function createCookieJar() {
	const store = new Map();
	return {
		set(name, value) {
			store.set(name, value);
		},
		clear() {
			store.clear();
		},
		get(name) {
			if (!store.has(name)) return undefined;
			return { name, value: store.get(name) };
		},
	};
}

// Singletons shared between the route modules (via stub redirects in the
// alias loader) and the integration tests.
export const prisma = createFakePrisma();
export const cookieJar = createCookieJar();

export function resetHarness(seed) {
	prisma.__reset();
	cookieJar.clear();
	if (seed) prisma.__seed(seed);
}
