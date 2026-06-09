import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { auditEvent } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { enrollPrivateFieldKeyReference } from '@/lib/security/privateFieldKeys';
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
		const key = await enrollPrivateFieldKeyReference({
			prisma,
			audit: auditEvent,
			session: actor.session,
			role: actor.role,
			actorSource: actor.source,
			tenantId: body.tenantId,
			hoaId: body.hoaId || null,
			credentialId: body.credentialId,
			envelope: body.envelope,
			unlockProof: body.unlockProof,
			version: body.version || 1,
		});

		return Response.json(
			{ key },
			{ status: 201, headers: await corsHeadersForRequest(req) },
		);
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to enroll private-field key reference'),
			400,
		);
	}
}
