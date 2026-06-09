import { NextResponse } from 'next/server';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { ensureHavenxSigClient } from '@/lib/signatura-oauth';

const REQUIRED_PARAMS = [
	'client_id',
	'redirect_uri',
	'scope',
	'state',
	'code_challenge',
	'code_challenge_method',
];

function signaturaPublicUrl(req: Request) {
	return process.env.SIGNATURA_PUBLIC_URL || req.url;
}

export async function GET(req: Request) {
	try {
		const url = new URL(req.url);
		const missing = REQUIRED_PARAMS.filter((name) => !url.searchParams.get(name));

		if (missing.length) {
			return jsonError(`Missing required query params: ${missing.join(', ')}`);
		}

		const client = await ensureHavenxSigClient();
		const clientId = url.searchParams.get('client_id') || '';
		const redirectUri = url.searchParams.get('redirect_uri') || '';
		const codeChallengeMethod =
			url.searchParams.get('code_challenge_method') || '';

		if (client.clientId !== clientId) {
			return jsonError('OAuth client not found', 404);
		}

		if (client.status !== 'active') {
			return jsonError('OAuth client is not active', 403);
		}

		if (!client.redirectUris.includes(redirectUri)) {
			return jsonError('redirect_uri is not allowed', 400);
		}

		if (!['S256', 'plain'].includes(codeChallengeMethod)) {
			return jsonError('code_challenge_method must be S256 or plain');
		}

		const consentUrl = new URL('/consent', signaturaPublicUrl(req));
		for (const name of REQUIRED_PARAMS) {
			consentUrl.searchParams.set(name, url.searchParams.get(name) || '');
		}

		return NextResponse.redirect(consentUrl, 303);
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to start authorization'),
			400,
		);
	}
}
