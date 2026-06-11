import crypto from 'crypto';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { auditEvent } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { ROLES } from '@/lib/roles';
import { requireSession, hasRecentVerification } from '@/lib/session';
import { authorizePrivateFieldAccess } from '@/lib/security/privateFieldKeys';
import { approveHavenUnlockChallenge, fetchHavenUnlockChallenge } from '@/lib/havenRemoteUnlock';

const REMOTE_UNLOCK_CLIENT_ID = 'signatura_remote_unlock';
const REMOTE_UNLOCK_SCOPES = ['decrypt_private_record', 'read_encrypted_payload'];

async function ensureRemoteUnlockConsent(userId) {
	const existing = await prisma.consent.findFirst({
		where: {
			userId,
			clientId: REMOTE_UNLOCK_CLIENT_ID,
			status: 'approved',
			revokedAt: null,
			scopes: { hasSome: REMOTE_UNLOCK_SCOPES },
		},
		orderBy: { createdAt: 'desc' },
	});
	if (existing) return existing;

	return prisma.consent.create({
		data: {
			id: crypto.randomUUID(),
			userId,
			clientId: REMOTE_UNLOCK_CLIENT_ID,
			scopes: REMOTE_UNLOCK_SCOPES,
			status: 'approved',
		},
	});
}

async function ensureIssuerMembership(userId, tenantId, hoaName) {
	const existing = await prisma.issuerUser.findFirst({
		where: {
			userId,
			tenantId,
			status: 'active',
		},
		orderBy: { activatedAt: 'desc' },
	});
	if (existing) return existing;

	await prisma.tenant.upsert({
		where: { id: tenantId },
		update: { name: hoaName || undefined },
		create: {
			id: tenantId,
			name: hoaName || 'HOA Tenant',
			externalReference: tenantId,
		},
	});

	return prisma.issuerUser.create({
		data: {
			id: crypto.randomUUID(),
			tenantId,
			userId,
			email: `${userId}@signatura.remote-unlock`,
			role: ROLES.ISSUER_ADMIN,
			status: 'active',
			activatedAt: new Date(),
		},
	});
}

export async function POST(req) {
	try {
		const session = await requireSession();
		if (!session?.userId) return jsonError('Authentication required', 401);
		if (!hasRecentVerification(session)) {
			return jsonError('Recent passkey verification required', 403);
		}

		const user = await prisma.user.findUnique({
			where: { id: session.userId },
			select: { id: true, signaturaId: true },
		});
		if (!user?.id) return jsonError('Signatura identity is required', 403);

		const body = await req.json().catch(() => ({}));
		const challengeId = String(body.challengeId ?? '').trim();
		const shortCode = String(body.shortCode ?? '').trim().toUpperCase();
		const credentialId = String(body.credentialId ?? '').trim();
		const unlockProof = String(body.unlockProof ?? '').trim();
		const wrappedKeyPayload = String(body.wrappedKeyPayload ?? '').trim();

		if (!challengeId || !shortCode || !credentialId || !unlockProof || !wrappedKeyPayload) {
			return jsonError('Challenge, credential, proof, and wrapped payload are required', 400);
		}

		const challenge = await fetchHavenUnlockChallenge({ challengeId, shortCode });
		await ensureIssuerMembership(user.id, challenge.hoaId, challenge.hoaName);
		const consent = await ensureRemoteUnlockConsent(session.userId);

		const authorization = await authorizePrivateFieldAccess({
			prisma,
			audit: auditEvent,
			session,
			role: ROLES.ISSUER_ADMIN,
			tenantId: challenge.hoaId,
			hoaId: challenge.hoaId,
			keyRef: challenge.keyRef,
			purpose: 'decrypt_private_record',
			credentialId,
			unlockProof,
			consentId: consent.id,
			ttlSeconds: 900,
			actorSource: 'cookie',
		});

		const trustedDevice = await prisma.trustedDevice.findFirst({
			where: {
				userId: session.userId,
				credentialId,
				isTrusted: true,
				removedAt: null,
			},
		});

		// Haven OAuth links users by Signatura internal user id (users/me signatura_user_id).
		const approved = await approveHavenUnlockChallenge({
			challengeId,
			shortCode,
			signaturaSubject: user.id,
			signaturaUserId: user.id,
			deviceId: trustedDevice?.id ?? credentialId,
			proofId: authorization.authorizationToken,
			keyRef: challenge.keyRef,
			wrappedKeyPayload,
		});

		return Response.json({
			ok: true,
			challenge: approved,
			proofId: authorization.authorizationToken,
			expiresAt: authorization.expiresAt,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to approve remote unlock'),
			error.status ?? 400,
		);
	}
}
