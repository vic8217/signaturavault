import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { auditEvent } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { requireSession, hasRecentVerification } from '@/lib/session';
import { ROLES } from '@/lib/roles';
import { enrollPrivateFieldKeyReference } from '@/lib/security/privateFieldKeys';
import { SERVICE_ACTOR_CREDENTIAL_ID } from '@/lib/security/zeroTrustActor';

export async function POST(req) {
	try {
		const session = await requireSession();
		if (!session?.userId) return jsonError('Authentication required', 401);
		if (!hasRecentVerification(session)) {
			return jsonError('Recent passkey verification required', 403);
		}

		const body = await req.json().catch(() => ({}));
		const tenantId = String(body.tenantId || body.hoaId || '').trim();
		if (!tenantId) return jsonError('tenantId is required');

		const key = await enrollPrivateFieldKeyReference({
			prisma,
			audit: auditEvent,
			session,
			role: ROLES.ISSUER_ADMIN,
			actorSource: 'bearer',
			tenantId,
			hoaId: String(body.hoaId || tenantId).trim(),
			credentialId: SERVICE_ACTOR_CREDENTIAL_ID,
			envelope: body.envelope,
			unlockProof: body.unlockProof,
			version: body.version || 1,
		});

		return Response.json({ ok: true, key }, { status: 201 });
	} catch (error) {
		return jsonError(safeApiErrorMessage(error, 'Unable to enroll HOA key'), 400);
	}
}
