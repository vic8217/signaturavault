import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

const HAVENXSIG_CLIENT_ID = 'havenxsig_client';
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const AUTHORIZATION_CODE_TTL_MS = 10 * 60 * 1000;

function base64url(input: Buffer | string) {
	return Buffer.from(input).toString('base64url');
}

function hashSecret(secret: string) {
	return crypto.createHash('sha256').update(secret).digest('hex');
}

function hashToken(token: string) {
	return hashSecret(token);
}

function randomToken(prefix: string) {
	return `${prefix}_${crypto.randomBytes(32).toString('base64url')}`;
}

function getHavenxSigClientSecret() {
	return process.env.HAVENXSIG_CLIENT_SECRET || randomToken('havenxsig_secret');
}

function allowedHavenxSigRedirectUris() {
	if (process.env.NODE_ENV === 'production') {
		return ['https://havenxsig.com/auth/callback'];
	}

	return [process.env.HAVENXSIG_CALLBACK_URL || 'http://localhost:3001/auth/callback'];
}

function allowedHavenxSigOrigins() {
	if (process.env.NODE_ENV === 'production') {
		return ['https://havenxsig.com'];
	}

	return [process.env.HAVENXSIG_ORIGIN || 'http://localhost:3001'];
}

function sameStringList(left: string[], right: string[]) {
	return left.length === right.length && left.every((item, index) => item === right[index]);
}

async function ensureHavenxSigClient() {
	const existing = await prisma.apiClient.findUnique({
		where: { clientId: HAVENXSIG_CLIENT_ID },
	});

	const redirectUris = allowedHavenxSigRedirectUris();
	const allowedOrigins = allowedHavenxSigOrigins();

	if (existing) {
		if (
			sameStringList(existing.redirectUris, redirectUris) &&
			sameStringList(existing.allowedOrigins, allowedOrigins)
		) {
			return existing;
		}

		return prisma.apiClient.update({
			where: { id: existing.id },
			data: {
				redirectUris,
				allowedOrigins,
			},
		});
	}

	return prisma.apiClient.create({
		data: {
			name: 'HavenxSig',
			clientId: HAVENXSIG_CLIENT_ID,
			clientSecret: getHavenxSigClientSecret(),
			redirectUris,
			allowedOrigins,
			status: 'active',
		},
	});
}

function scopesFromString(scope: string) {
	return scope.split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

function pkceChallengeForVerifier(verifier: string, method: string) {
	if (method === 'plain') return verifier;

	return base64url(crypto.createHash('sha256').update(verifier).digest());
}

function timingSafeEqualString(left: string, right: string) {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);

	return (
		leftBuffer.length === rightBuffer.length &&
		crypto.timingSafeEqual(leftBuffer, rightBuffer)
	);
}

function bearerTokenFromRequest(req: Request) {
	const auth = req.headers.get('authorization') || '';
	const match = auth.match(/^Bearer\s+(.+)$/i);
	return match?.[1]?.trim() || null;
}

async function authenticateBearerToken(req: Request) {
	const token = bearerTokenFromRequest(req);
	if (!token) return null;

	const session = await prisma.signaturaSession.findUnique({
		where: { tokenHash: hashToken(token) },
	});

	if (!session || session.expiresAt <= new Date()) return null;
	return session;
}

async function corsHeadersForRequest(req: Request) {
	const origin = req.headers.get('origin');
	if (!origin) return {};

	const client = await ensureHavenxSigClient();
	if (!client.allowedOrigins.includes(origin)) return {};

	return {
		'Access-Control-Allow-Origin': origin,
		'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
		'Access-Control-Allow-Headers': 'authorization,content-type',
		Vary: 'Origin',
	};
}

async function corsPreflight(req: Request) {
	return new Response(null, {
		status: 204,
		headers: await corsHeadersForRequest(req),
	});
}

export {
	ACCESS_TOKEN_TTL_SECONDS,
	AUTHORIZATION_CODE_TTL_MS,
	HAVENXSIG_CLIENT_ID,
	allowedHavenxSigOrigins,
	allowedHavenxSigRedirectUris,
	authenticateBearerToken,
	corsHeadersForRequest,
	corsPreflight,
	ensureHavenxSigClient,
	hashSecret,
	hashToken,
	pkceChallengeForVerifier,
	randomToken,
	scopesFromString,
	timingSafeEqualString,
};
