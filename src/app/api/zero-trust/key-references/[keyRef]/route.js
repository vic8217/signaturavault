import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { auditEvent } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import {
	publicKeyMetadata,
	validateUnlockAuthorization,
	verifyTenantScope,
} from '@/lib/security/privateFieldKeys';
import { resolveZeroTrustActor } from '@/lib/security/zeroTrustActor';
import { corsHeadersForRequest, corsPreflight } from '@/lib/signatura-oauth';

export async function OPTIONS(req) {
	return corsPreflight(req);
}

export async function GET(req, { params }) {
	try {
		const actor = await resolveZeroTrustActor(req);
		if (!actor) return jsonError('Authentication required', 401);

		const session = actor.session;
		const role = actor.role;
		const { keyRef } = await params;
		const { searchParams } = new URL(req.url);
		const tenantId = String(searchParams.get('tenantId') || '').trim();
		const authorizationToken = String(
			searchParams.get('authorizationToken') || '',
		).trim();
		const purpose = String(
			searchParams.get('purpose') || 'read_encrypted_payload',
		).trim();
		if (!tenantId || !authorizationToken) {
			return jsonError('tenantId and authorizationToken are required');
		}

		await verifyTenantScope({
			prisma,
			session,
			role,
			tenantId,
			actorSource: actor.source,
		});
		await validateUnlockAuthorization({
			prisma,
			audit: auditEvent,
			session,
			role,
			actorSource: actor.source,
			tenantId,
			keyRef,
			purpose,
			authorizationToken,
		});
		const key = await prisma.privateFieldKeyReference.findFirst({
			where: {
				tenantId,
				keyRef,
				status: 'active',
			},
		});
		if (!key) return jsonError('Private-field key reference not found', 404);

		await auditEvent({
			tenantId,
			userId: session.userId,
			action: 'KEY_REFERENCE_VIEWED',
			target: keyRef,
			details: { purpose },
		});

		return Response.json(
			{ key: publicKeyMetadata(key), rawKeyReturned: false },
			{
				headers: {
					'Cache-Control': 'no-store',
					...(await corsHeadersForRequest(req)),
				},
			},
		);
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to load private-field key reference'),
			400,
		);
	}
}
