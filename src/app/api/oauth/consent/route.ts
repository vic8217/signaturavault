import { NextResponse } from 'next/server';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import {
	AUTHORIZATION_CODE_TTL_MS,
	ensureHavenxSigClient,
	randomToken,
	scopesFromString,
} from '@/lib/signatura-oauth';

async function readBody(req: Request) {
	const contentType = req.headers.get('content-type') || '';
	if (contentType.includes('application/json')) {
		return req.json().catch(() => ({}));
	}

	const formData = await req.formData();
	return Object.fromEntries(formData.entries());
}

export async function POST(req: Request) {
	try {
		const session = await requireSession();
		if (!session?.userId) return jsonError('Authentication required', 401);

		const body = await readBody(req);
		const action = String(body.action || '');
		const clientId = String(body.client_id || '');
		const redirectUri = String(body.redirect_uri || '');
		const scope = String(body.scope || '');
		const state = String(body.state || '');
		const codeChallenge = String(body.code_challenge || '');
		const codeChallengeMethod = String(body.code_challenge_method || 'S256');

		const client = await ensureHavenxSigClient();
		if (client.clientId !== clientId || client.status !== 'active') {
			return jsonError('OAuth client is not allowed', 403);
		}

		if (!client.redirectUris.includes(redirectUri)) {
			return jsonError('redirect_uri is not allowed', 400);
		}

		if (!state || !codeChallenge) {
			return jsonError('state and code_challenge are required');
		}

		const callbackUrl = new URL(redirectUri);
		callbackUrl.searchParams.set('state', state);

		if (action !== 'approve') {
			callbackUrl.searchParams.set('error', 'access_denied');
			return NextResponse.redirect(callbackUrl, 303);
		}

		const code = randomToken('sig_code');
		const scopes = scopesFromString(scope);

		await prisma.$transaction(async (tx) => {
			await tx.consent.create({
				data: {
					userId: session.userId,
					clientId,
					scopes,
					status: 'approved',
				},
			});

			await tx.authorizationCode.create({
				data: {
					code,
					userId: session.userId,
					clientId,
					redirectUri,
					codeChallenge,
					codeChallengeMethod,
					scopes,
					expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_MS),
				},
			});
		});

		callbackUrl.searchParams.set('code', code);
		return NextResponse.redirect(callbackUrl, 303);
	} catch (error) {
		return jsonError(safeApiErrorMessage(error, 'Unable to record consent'), 400);
	}
}
