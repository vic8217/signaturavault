import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import {
	ACCESS_TOKEN_TTL_SECONDS,
	corsHeadersForRequest,
	corsPreflight,
	ensureHavenxSigClient,
	hashToken,
	pkceChallengeForVerifier,
	randomToken,
	timingSafeEqualString,
} from '@/lib/signatura-oauth';

export async function OPTIONS(req: Request) {
	return corsPreflight(req);
}

export async function POST(req: Request) {
	try {
		const corsHeaders = await corsHeadersForRequest(req);
		const body = await req.json().catch(() => ({}));
		const grantType = String(body.grant_type || '');
		const code = String(body.code || '');
		const redirectUri = String(body.redirect_uri || '');
		const clientId = String(body.client_id || '');
		const codeVerifier = String(body.code_verifier || '');

		if (grantType !== 'authorization_code') {
			return jsonError('grant_type must be authorization_code');
		}

		if (!code || !redirectUri || !clientId || !codeVerifier) {
			return jsonError(
				'code, redirect_uri, client_id, and code_verifier are required',
			);
		}

		const client = await ensureHavenxSigClient();
		if (client.clientId !== clientId || client.status !== 'active') {
			return jsonError('OAuth client is not allowed', 403);
		}

		const authorizationCode = await prisma.authorizationCode.findUnique({
			where: { code },
		});

		if (!authorizationCode) return jsonError('Authorization code not found', 404);
		if (authorizationCode.usedAt) {
			return jsonError('Authorization code has already been used', 400);
		}
		if (authorizationCode.expiresAt <= new Date()) {
			return jsonError('Authorization code has expired', 400);
		}
		if (
			authorizationCode.clientId !== clientId ||
			authorizationCode.redirectUri !== redirectUri
		) {
			return jsonError('Authorization code request does not match', 400);
		}

		const expectedChallenge = pkceChallengeForVerifier(
			codeVerifier,
			authorizationCode.codeChallengeMethod,
		);
		if (
			!timingSafeEqualString(expectedChallenge, authorizationCode.codeChallenge)
		) {
			return jsonError('PKCE verification failed', 401);
		}

		const accessToken = randomToken('sig_access');
		const now = new Date();
		const expiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000);

		await prisma.$transaction([
			prisma.authorizationCode.update({
				where: { id: authorizationCode.id },
				data: { usedAt: now },
			}),
			prisma.signaturaSession.create({
				data: {
					userId: authorizationCode.userId,
					tokenHash: hashToken(accessToken),
					expiresAt,
				},
			}),
		]);

		return Response.json(
			{
				access_token: accessToken,
				token_type: 'Bearer',
				expires_in: ACCESS_TOKEN_TTL_SECONDS,
			},
			{ headers: corsHeaders },
		);
	} catch (error) {
		return jsonError(safeApiErrorMessage(error, 'Unable to issue token'), 400);
	}
}
