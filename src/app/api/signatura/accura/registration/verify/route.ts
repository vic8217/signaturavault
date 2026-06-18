import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api';
import {
	verifyAccuraOnboardingAuthorizationCode,
	verifyAccuraRegistrationCallback,
} from '@/lib/accuraRegistrationHandoff';
import {
	authenticateSignaturaClient,
	clientCredentials,
} from '@/lib/signaturaClientAuth';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
	const body = await req.json().catch(() => ({}));
	const credentials = clientCredentials(req, body);
	const client = await authenticateSignaturaClient({
		prisma,
		clientId: credentials.clientId,
		clientSecret: credentials.clientSecret,
	});
	if (!client || client.sourceApp !== 'ACCURA') {
		return jsonError('Unauthorized ACCURA client', 401);
	}

	const authorizationCode = String(body.authorizationCode || '').trim();
	if (authorizationCode) {
		const verified = verifyAccuraOnboardingAuthorizationCode(authorizationCode);
		if (!verified.valid) {
			return jsonError('Invalid or expired ACCURA authorization code', 401);
		}
		return NextResponse.json({
			ok: true,
			mode: 'authorization_code',
			payload: verified.payload,
		});
	}

	const proofPayload = String(body.proofPayload || '').trim();
	const proof = String(body.proof || '').trim();
	if (!proofPayload || !proof) {
		return jsonError('authorizationCode or proofPayload/proof is required', 400);
	}

	const verified = verifyAccuraRegistrationCallback(proofPayload, proof);
	if (!verified.valid) {
		return jsonError('Invalid ACCURA registration callback proof', 401);
	}

	return NextResponse.json({
		ok: true,
		mode: 'signed_callback',
		payload: verified.payload,
	});
}
