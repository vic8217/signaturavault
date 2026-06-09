import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { auditEvent } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { authorizePrivateFieldAccess } from '@/lib/security/privateFieldKeys';
import { resolveZeroTrustActor } from '@/lib/security/zeroTrustActor';
import { corsHeadersForRequest, corsPreflight } from '@/lib/signatura-oauth';

export async function OPTIONS(req) {
	return corsPreflight(req);
}

export async function POST(req) {
	try {
		const actor = await resolveZeroTrustActor(req);
		if (!actor) return jsonError('Authentication required', 401);

		const body = await req.json().catch(() => ({}));
		const authorization = await authorizePrivateFieldAccess({
			prisma,
			audit: auditEvent,
			session: actor.session,
			role: actor.role,
			actorSource: actor.source,
			tenantId: body.tenantId,
			hoaId: body.hoaId || null,
			keyRef: body.keyRef,
			purpose: body.purpose,
			credentialId: body.credentialId,
			unlockProof: body.unlockProof,
			consentId: body.consentId,
			ttlSeconds: body.ttlSeconds,
		});

		return Response.json(
			{
				authorizationToken: authorization.authorizationToken,
				expiresAt: authorization.expiresAt,
				key: authorization.key,
				rawKeyReturned: false,
			},
			{ headers: await corsHeadersForRequest(req) },
		);
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to authorize private-field access'),
			400,
		);
	}
}
