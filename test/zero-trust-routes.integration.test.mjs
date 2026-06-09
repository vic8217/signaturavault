import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
	prisma,
	cookieJar,
	resetHarness,
	makeSessionCookie,
} from './harness/state.mjs';

import { POST as enrollPost } from '@/app/api/zero-trust/key-references/enroll/route.js';
import { POST as authorizePost } from '@/app/api/zero-trust/key-authorizations/route.js';
import { GET as keyReferenceGet } from '@/app/api/zero-trust/key-references/[keyRef]/route.js';
import {
	GET as encryptedPayloadsGet,
	POST as encryptedPayloadsPost,
} from '@/app/api/zero-trust/encrypted-payloads/route.js';

const ZT = 'https://vault.test/api/zero-trust';

const UNLOCK_PROOF = 'private-field-authorization-secret-high-entropy';
const ENVELOPE = {
	algorithm: 'AES-256-GCM',
	wrappedKey: Buffer.from('wrapped-key-ciphertext').toString('base64url'),
	salt: Buffer.from('salt').toString('base64url'),
	iv: Buffer.from('envelope-iv').toString('base64url'),
	tag: Buffer.from('envelope-tag').toString('base64url'),
	kdfName: 'PBKDF2',
	kdfParams: { iterations: 210000 },
};
const FIELD_CRYPTO = {
	algorithm: 'AES-GCM-256',
	iv: Buffer.alloc(12, 1).toString('base64url'),
	tag: Buffer.alloc(16, 2).toString('base64url'),
	ciphertext: Buffer.from('field-ciphertext').toString('base64url'),
};

function jsonRequest(url, body) {
	return new Request(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

function queryRequest(baseUrl, query) {
	const url = new URL(baseUrl);
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined && value !== null) url.searchParams.set(key, value);
	}
	return new Request(url, { method: 'GET' });
}

function signIn({
	userId = 'user_admin',
	email = 'admin@tenant1.test',
	role = 'ISSUER_ADMIN',
	tenantId = 'tenant_1',
	recentVerification = true,
} = {}) {
	const session = {
		userId,
		email,
		createdAt: Date.now(),
		...(recentVerification ? { reauthenticatedAt: Date.now() } : {}),
	};
	cookieJar.set('signatura_session', makeSessionCookie(session));
	cookieJar.set('signatura_role', role);
	return { userId, email, tenantId };
}

function seedBaseline({
	userId = 'user_admin',
	email = 'admin@tenant1.test',
	tenantId = 'tenant_1',
	credentialId = 'cred_admin',
	consentScopes = ['read_encrypted_payload', 'export_payload'],
} = {}) {
	prisma.__seed({
		user: [{ id: userId, email }],
		issuerUser: [
			{
				id: `iu_${userId}`,
				userId,
				tenantId,
				role: 'ISSUER_ADMIN',
				status: 'active',
				activatedAt: new Date('2026-01-01T00:00:00.000Z'),
			},
		],
		trustedDevice: [
			{
				id: `td_${userId}`,
				userId,
				credentialId,
				isTrusted: true,
				removedAt: null,
			},
		],
		consent: [
			{
				id: `consent_${userId}`,
				userId,
				clientId: 'client_1',
				status: 'approved',
				revokedAt: null,
				scopes: consentScopes,
			},
		],
	});
}

async function enrollKey(ctx, { url = `${ZT}/key-references/enroll` } = {}) {
	const res = await enrollPost(
		jsonRequest(url, {
			tenantId: ctx.tenantId,
			credentialId: 'cred_admin',
			envelope: ENVELOPE,
			unlockProof: UNLOCK_PROOF,
			version: 1,
		}),
	);
	return res;
}

async function authorize(ctx, { purpose, consentId, keyRef, url = `${ZT}/key-authorizations` }) {
	const res = await authorizePost(
		jsonRequest(url, {
			tenantId: ctx.tenantId,
			keyRef,
			purpose,
			credentialId: 'cred_admin',
			unlockProof: UNLOCK_PROOF,
			consentId,
		}),
	);
	return res;
}

test.beforeEach(() => {
	resetHarness();
});

test('zero-trust key enrollment stores wrapped envelope and audits without raw key', async () => {
	const ctx = signIn();
	seedBaseline();

	const res = await enrollKey(ctx);
	assert.equal(res.status, 201);
	assert.equal(res.headers.get('Deprecation'), null);

	const payload = await res.json();
	assert.equal(payload.key.tenantId, 'tenant_1');
	assert.ok(payload.key.keyRef.startsWith('ztpf_tenant_1_'));
	assert.equal(payload.key.wrappedKey, ENVELOPE.wrappedKey);
	assert.equal(Object.keys(payload.key).some((k) => /raw|plain/i.test(k)), false);

	assert.equal(prisma.privateFieldKeyReference.__rows.length, 1);
	assert.ok(prisma.privateFieldKeyReference.__rows[0].unlockProofHash.startsWith('scrypt$'));
	const enrollAudit = prisma.auditLog.__rows.find(
		(row) => row.action === 'KEY_REFERENCE_ENROLLED',
	);
	assert.ok(enrollAudit);
	assert.equal(prisma.securityAuditLog.__rows.length >= 1, true);
});

test('re-enrolling an active private-field key reference returns existing metadata', async () => {
	const ctx = signIn();
	seedBaseline();

	const firstRes = await enrollKey(ctx);
	assert.equal(firstRes.status, 201);
	const firstPayload = await firstRes.json();

	const secondRes = await enrollKey(ctx);
	assert.equal(secondRes.status, 201);
	const secondPayload = await secondRes.json();

	assert.equal(secondPayload.key.keyRef, firstPayload.key.keyRef);
	assert.equal(secondPayload.key.tenantId, firstPayload.key.tenantId);
	assert.equal(secondPayload.key.alreadyEnrolled, true);
	assert.equal(prisma.privateFieldKeyReference.__rows.length, 1);
});

test('enrollment is rejected without an authenticated session', async () => {
	const ctx = { tenantId: 'tenant_1' };
	const res = await enrollKey(ctx);
	assert.equal(res.status, 401);
});

test('provider administrators cannot enroll private-field key references', async () => {
	const ctx = signIn({ role: 'SIGNATURA_ADMIN' });
	seedBaseline();
	const res = await enrollKey(ctx);
	assert.equal(res.status, 400);
	const payload = await res.json();
	assert.match(payload.error, /Provider administrators cannot access private data/);
});

test('encrypted payload read authorization requires approved consent and issues a one-time token', async () => {
	const ctx = signIn();
	seedBaseline();
	const enrollRes = await enrollKey(ctx);
	const { key } = await enrollRes.json();

	// Without consent the decrypt authorization fails closed.
	const noConsent = await authorize(ctx, {
		purpose: 'read_encrypted_payload',
		keyRef: key.keyRef,
	});
	assert.equal(noConsent.status, 400);
	assert.match((await noConsent.json()).error, /Approved consent proof required/);

	const res = await authorize(ctx, {
		purpose: 'read_encrypted_payload',
		keyRef: key.keyRef,
		consentId: 'consent_user_admin',
	});
	assert.equal(res.status, 200);
	const payload = await res.json();
	assert.equal(payload.rawKeyReturned, false);
	assert.ok(payload.authorizationToken.startsWith('ckauth_'));
	assert.equal(prisma.privateFieldKeyAuthorization.__rows.length, 1);
	assert.equal(prisma.privateFieldKeyAuthorization.__rows[0].status, 'authorized');
});

test('private-field key reference metadata read consumes the authorization token exactly once', async () => {
	const ctx = signIn();
	seedBaseline();
	const { key } = await (await enrollKey(ctx)).json();
	const { authorizationToken } = await (
		await authorize(ctx, {
			purpose: 'read_encrypted_payload',
			keyRef: key.keyRef,
			consentId: 'consent_user_admin',
		})
	).json();

	const params = { params: Promise.resolve({ keyRef: key.keyRef }) };
	const firstRes = await keyReferenceGet(
		queryRequest(`${ZT}/key-references/${key.keyRef}`, {
			tenantId: ctx.tenantId,
			authorizationToken,
			purpose: 'read_encrypted_payload',
		}),
		params,
	);
	assert.equal(firstRes.status, 200);
	assert.equal(firstRes.headers.get('Cache-Control'), 'no-store');
	const firstPayload = await firstRes.json();
	assert.equal(firstPayload.key.keyRef, key.keyRef);
	assert.equal(firstPayload.rawKeyReturned, false);
	assert.equal(prisma.privateFieldKeyAuthorization.__rows[0].status, 'consumed');

	// Replaying the consumed token must fail closed.
	const replay = await keyReferenceGet(
		queryRequest(`${ZT}/key-references/${key.keyRef}`, {
			tenantId: ctx.tenantId,
			authorizationToken,
			purpose: 'read_encrypted_payload',
		}),
		params,
	);
	assert.equal(replay.status, 400);
	assert.match((await replay.json()).error, /Valid private-field authorization required/);
});

test('encrypted payload write then read round-trips ciphertext without plaintext', async () => {
	const ctx = signIn();
	seedBaseline();
	const { key } = await (await enrollKey(ctx)).json();

	const encryptAuth = await (
		await authorize(ctx, { purpose: 'encrypt_payload', keyRef: key.keyRef })
	).json();

	const writeRes = await encryptedPayloadsPost(
		jsonRequest(`${ZT}/encrypted-payloads`, {
			tenantId: ctx.tenantId,
			recordType: 'homeowner',
			recordId: 'homeowner_1',
			fieldKey: 'phone',
			keyRef: key.keyRef,
			...FIELD_CRYPTO,
			purpose: 'encrypt_payload',
			authorizationToken: encryptAuth.authorizationToken,
		}),
	);
	assert.equal(writeRes.status, 200);
	const writePayload = await writeRes.json();
	assert.equal(writePayload.plaintextStored, false);
	assert.equal(writePayload.field.ciphertext, FIELD_CRYPTO.ciphertext);
	assert.equal(prisma.encryptedPrivateField.__rows.length, 1);

	const readAuth = await (
		await authorize(ctx, {
			purpose: 'read_encrypted_payload',
			keyRef: key.keyRef,
			consentId: 'consent_user_admin',
		})
	).json();

	const readRes = await encryptedPayloadsGet(
		queryRequest(`${ZT}/encrypted-payloads`, {
			tenantId: ctx.tenantId,
			recordType: 'homeowner',
			recordId: 'homeowner_1',
			keyRef: key.keyRef,
			authorizationToken: readAuth.authorizationToken,
			purpose: 'read_encrypted_payload',
		}),
	);
	assert.equal(readRes.status, 200);
	const readPayload = await readRes.json();
	assert.equal(readPayload.plaintextReturned, false);
	assert.equal(readPayload.rawKeyReturned, false);
	assert.equal(readPayload.fields.length, 1);
	assert.equal(readPayload.fields[0].ciphertext, FIELD_CRYPTO.ciphertext);
	assert.equal(readPayload.fields[0].fieldKey, 'phone');
});

test('encrypted payload read requires a valid authorization token', async () => {
	const ctx = signIn();
	seedBaseline();
	const { key } = await (await enrollKey(ctx)).json();

	const res = await encryptedPayloadsGet(
		queryRequest(`${ZT}/encrypted-payloads`, {
			tenantId: ctx.tenantId,
			recordType: 'homeowner',
			recordId: 'homeowner_1',
			keyRef: key.keyRef,
			authorizationToken: 'ckauth_forged_token',
			purpose: 'read_encrypted_payload',
		}),
	);
	assert.equal(res.status, 400);
	assert.match((await res.json()).error, /Valid private-field authorization required/);
});

test('tenant scope is enforced across tenants', async () => {
	const ctx = signIn({ tenantId: 'tenant_1' });
	seedBaseline({ tenantId: 'tenant_1' });
	// Enroll a key the attacker will try to authorize against from another tenant.
	const { key } = await (await enrollKey(ctx)).json();

	// Same authenticated admin, but requests a tenant they are not a member of.
	const res = await authorize(
		{ tenantId: 'tenant_2' },
		{ purpose: 'read_encrypted_payload', keyRef: key.keyRef, consentId: 'consent_user_admin' },
	);
	assert.equal(res.status, 400);
	assert.match((await res.json()).error, /not authorized for this tenant/);
});

// --- Service-to-service (HavenxSig OAuth Bearer) path ---------------------
// No interactive cookie session, no passkey/device proof — the caller presents
// a Signatura OAuth access token and is bound to its HOA tenant on first use.

const SVC_USER = 'svc_havenxsig';
const SVC_TENANT = 'tenant_svc';
const HAVENXSIG_CLIENT_ID = 'havenxsig_client';

function bearerToken(userId = SVC_USER) {
	const token = `oauth_${userId}_token`;
	prisma.signaturaSession.__seed([
		{
			id: `ss_${userId}`,
			userId,
			tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
			expiresAt: new Date(Date.now() + 60 * 60 * 1000),
		},
	]);
	return token;
}

function bearerJson(url, body, token) {
	return new Request(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${token}`,
		},
		body: JSON.stringify(body),
	});
}

function bearerQuery(baseUrl, query, token) {
	const url = new URL(baseUrl);
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined && value !== null) url.searchParams.set(key, value);
	}
	return new Request(url, {
		method: 'GET',
		headers: { authorization: `Bearer ${token}` },
	});
}

function seedHavenxSigConsent(userId = SVC_USER) {
	prisma.consent.__seed([
		{
			id: `consent_${userId}`,
			userId,
			clientId: HAVENXSIG_CLIENT_ID,
			status: 'approved',
			revokedAt: null,
			scopes: ['identity.verify', 'device.verify', 'consent.basic'],
			createdAt: new Date('2026-01-01T00:00:00.000Z'),
		},
	]);
}

async function bearerEnroll(token, { tenantId = SVC_TENANT } = {}) {
	return enrollPost(
		bearerJson(
			`${ZT}/key-references/enroll`,
			{ tenantId, envelope: ENVELOPE, unlockProof: UNLOCK_PROOF, version: 1 },
			token,
		),
	);
}

test('service bearer caller enrolls a key and is auto-bound to its tenant', async () => {
	const token = bearerToken();

	const res = await bearerEnroll(token);
	assert.equal(res.status, 201);
	const payload = await res.json();
	assert.equal(payload.key.tenantId, SVC_TENANT);

	// Tenant binding is established by an auto-provisioned issuer membership.
	const membership = prisma.issuerUser.__rows.find(
		(row) => row.userId === SVC_USER && row.tenantId === SVC_TENANT,
	);
	assert.ok(membership);
	assert.equal(membership.role, 'ISSUER_ADMIN');
	assert.equal(membership.status, 'active');
});

test('zero-trust endpoints reject a missing or invalid bearer token', async () => {
	// No credential at all.
	const noAuth = await bearerEnroll('');
	assert.equal(noAuth.status, 401);

	// Token that does not map to a Signatura session.
	const bogus = await enrollPost(
		bearerJson(
			`${ZT}/key-references/enroll`,
			{ tenantId: SVC_TENANT, envelope: ENVELOPE, unlockProof: UNLOCK_PROOF },
			'oauth_unknown_token',
		),
	);
	assert.equal(bogus.status, 401);
});

test('service bearer encrypted payload read authorization requires approved HavenxSig consent', async () => {
	const token = bearerToken();
	const { key } = await (await bearerEnroll(token)).json();

	const denied = await authorizePost(
		bearerJson(
			`${ZT}/key-authorizations`,
			{
				tenantId: SVC_TENANT,
				keyRef: key.keyRef,
				purpose: 'read_encrypted_payload',
				unlockProof: UNLOCK_PROOF,
			},
			token,
		),
	);
	assert.equal(denied.status, 400);
	assert.match((await denied.json()).error, /Approved consent proof required/);

	seedHavenxSigConsent();
	const granted = await authorizePost(
		bearerJson(
			`${ZT}/key-authorizations`,
			{
				tenantId: SVC_TENANT,
				keyRef: key.keyRef,
				purpose: 'read_encrypted_payload',
				unlockProof: UNLOCK_PROOF,
			},
			token,
		),
	);
	assert.equal(granted.status, 200);
	const payload = await granted.json();
	assert.equal(payload.rawKeyReturned, false);
	assert.ok(payload.authorizationToken.startsWith('ckauth_'));
});

test('service bearer authorization fails closed on an invalid proof', async () => {
	const token = bearerToken();
	const { key } = await (await bearerEnroll(token)).json();
	seedHavenxSigConsent();

	const res = await authorizePost(
		bearerJson(
			`${ZT}/key-authorizations`,
			{
				tenantId: SVC_TENANT,
				keyRef: key.keyRef,
				purpose: 'read_encrypted_payload',
				unlockProof: 'wrong-secret',
			},
			token,
		),
	);
	assert.equal(res.status, 400);
	assert.match((await res.json()).error, /authorization proof rejected/);
});

test('service bearer caller round-trips an encrypted payload', async () => {
	const token = bearerToken();
	const { key } = await (await bearerEnroll(token)).json();

	const encryptAuth = await (
		await authorizePost(
			bearerJson(
				`${ZT}/key-authorizations`,
				{
					tenantId: SVC_TENANT,
					keyRef: key.keyRef,
					purpose: 'encrypt_payload',
					unlockProof: UNLOCK_PROOF,
				},
				token,
			),
		)
	).json();

	const writeRes = await encryptedPayloadsPost(
		bearerJson(
			`${ZT}/encrypted-payloads`,
			{
				tenantId: SVC_TENANT,
				recordType: 'delivery',
				recordId: 'delivery_1',
				fieldKey: 'recipient_phone',
				keyRef: key.keyRef,
				...FIELD_CRYPTO,
				purpose: 'encrypt_payload',
				authorizationToken: encryptAuth.authorizationToken,
			},
			token,
		),
	);
	assert.equal(writeRes.status, 200);
	assert.equal((await writeRes.json()).plaintextStored, false);

	seedHavenxSigConsent();
	const readAuth = await (
		await authorizePost(
			bearerJson(
				`${ZT}/key-authorizations`,
				{
					tenantId: SVC_TENANT,
					keyRef: key.keyRef,
					purpose: 'read_encrypted_payload',
					unlockProof: UNLOCK_PROOF,
				},
				token,
			),
		)
	).json();

	const readRes = await encryptedPayloadsGet(
		bearerQuery(
			`${ZT}/encrypted-payloads`,
			{
				tenantId: SVC_TENANT,
				recordType: 'delivery',
				recordId: 'delivery_1',
				keyRef: key.keyRef,
				authorizationToken: readAuth.authorizationToken,
				purpose: 'read_encrypted_payload',
			},
			token,
		),
	);
	assert.equal(readRes.status, 200);
	const readPayload = await readRes.json();
	assert.equal(readPayload.plaintextReturned, false);
	assert.equal(readPayload.fields.length, 1);
	assert.equal(readPayload.fields[0].fieldKey, 'recipient_phone');
	assert.equal(readPayload.fields[0].ciphertext, FIELD_CRYPTO.ciphertext);
});
