import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { userPublicIdentity } from '@/lib/identity';
import { ROLE_COOKIE, ROLES } from '@/lib/roles';
import { requireSession, setSessionCookie } from '@/lib/session';
import {
	UNIVERSAL_ROLE_CODES,
	ensureIssuerMembershipRole,
} from '@/lib/universalIdentity';
import {
	getUserAgent,
	hashActivationToken,
	logSecurityEvent,
} from '@/lib/webauthn';

export async function POST(req: Request) {
	try {
		const session = await requireSession();
		if (!session?.userId) {
			return jsonError(
				'Please sign in with your Signatura ID to accept this issuer invitation.',
				401,
			);
		}
		if (session.accountStatus !== 'active' || Number(session.trustLevel || 0) < 2) {
			return jsonError(
				'Please sign in with your Signatura ID to accept this issuer invitation.',
				403,
			);
		}

		const body = await req.json().catch(() => ({}));
		const token = String(body.token || '').trim();
		if (!token) return jsonError('Activation token is required', 400);

		const invitation = await prisma.issuerInvitation.findFirst({
			where: {
				tokenHash: hashActivationToken(token),
				usedAt: null,
				expiresAt: { gt: new Date() },
			},
		});

		if (!invitation) {
			return jsonError('Activation link is invalid, expired, or already used', 400);
		}

		const now = new Date();
		const result = await prisma.$transaction(async (tx) => {
			const activatedUser = await tx.user.findUnique({
				where: { id: session.userId },
			});
			if (!activatedUser) throw new Error('User not found');

			const updated = await tx.issuerInvitation.updateMany({
				where: {
					id: invitation.id,
					usedAt: null,
					expiresAt: { gt: now },
				},
				data: {
					usedAt: now,
					activatedAt: now,
				},
			});
			if (updated.count !== 1) {
				throw new Error('Activation token was already used');
			}

			if (invitation.issuerUserId) {
				await tx.issuerUser.update({
					where: { id: invitation.issuerUserId },
					data: {
						userId: session.userId,
						role: ROLES.ISSUER_ADMIN,
						status: 'active',
						activatedAt: now,
					},
				});
			} else {
				await tx.issuerUser.create({
					data: {
						id: crypto.randomUUID(),
						tenantId: invitation.tenantId,
						issuerId: invitation.issuerId,
						userId: session.userId,
						email: invitation.email,
						role: ROLES.ISSUER_ADMIN,
						status: 'active',
						invitedAt: invitation.createdAt,
						activatedAt: now,
					},
				});
			}

			await ensureIssuerMembershipRole(tx, {
				identityId: session.userId,
				tenantId: invitation.tenantId,
				issuerId: invitation.issuerId,
				issuerName: invitation.issuerId || invitation.tenantId,
				roleCode: UNIVERSAL_ROLE_CODES.ISSUER_ADMIN,
			});

			const activeUser = await tx.user.update({
				where: { id: session.userId },
				data: {
					accountStatus: 'active',
					trustLevel: Math.max(Number(activatedUser.trustLevel || 1), 2),
				},
			});

			await tx.securityEventLog.create({
				data: {
					id: crypto.randomUUID(),
					userId: session.userId,
					event: 'issuer_invitation_access_linked',
					userAgent: getUserAgent(req),
					details: {
						invitationId: invitation.id,
						tenantId: invitation.tenantId,
						issuerId: invitation.issuerId,
						role: ROLES.ISSUER_ADMIN,
						activationMethod: 'authenticated_session',
					},
				},
			});

			return { user: activeUser };
		});

		await logSecurityEvent(req, 'issuer_invitation_activation_succeeded', session.userId, {
			invitationId: invitation.id,
			tenantId: invitation.tenantId,
			issuerId: invitation.issuerId,
			role: ROLES.ISSUER_ADMIN,
		});

		const response = NextResponse.json({
			ok: true,
			message: 'Issuer access linked successfully.',
			next: '/issuer',
			user: userPublicIdentity(result.user),
			role: ROLES.ISSUER_ADMIN,
			tenantId: invitation.tenantId,
			issuerId: invitation.issuerId,
		});
		setSessionCookie(response, req, {
			userId: result.user.id,
			signaturaId: result.user.signaturaId,
			role: ROLES.ISSUER_ADMIN,
			trustLevel: result.user.trustLevel,
			iat: Date.now(),
			createdAt: Date.now(),
			reauthenticatedAt: Date.now(),
		});
		response.cookies.set(ROLE_COOKIE, ROLES.ISSUER_ADMIN, {
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			path: '/',
			maxAge: 60 * 60 * 8,
		});

		return response;
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to accept issuer invitation'),
			(error as Error & { status?: number }).status ?? 400,
		);
	}
}
