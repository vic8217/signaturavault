import crypto from 'crypto';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { hasRecentVerification, requireSession } from '@/lib/session';
import { approveTrustedDeviceLoginChallenge } from '@/lib/trustedDeviceLoginChallenge';
import { getUserAgent, logSecurityEvent } from '@/lib/webauthn';

export async function POST(req) {
	try {
		const session = await requireSession();
		if (!session?.userId) return jsonError('Authentication required', 401);
		if (!hasRecentVerification(session)) {
			return jsonError('Recent passkey verification required', 403);
		}

		const body = await req.json().catch(() => ({}));
		const challengeId = String(body.challengeId ?? '').trim();
		const shortCode = String(body.shortCode ?? '').trim().toUpperCase();
		const credentialId = String(body.credentialId ?? '').trim();
		if (!challengeId || !shortCode || !credentialId) {
			return jsonError('Challenge, code, and credential are required', 400);
		}

		const trustedDevice = await prisma.trustedDevice.findFirst({
			where: {
				userId: session.userId,
				credentialId,
				isTrusted: true,
				removedAt: null,
			},
		});
		if (!trustedDevice) {
			return jsonError('Trusted device proof required', 403);
		}

		const approved = await approveTrustedDeviceLoginChallenge({
			challengeId,
			shortCode,
			approverUserId: session.userId,
			credentialId,
			trustedDeviceId: trustedDevice.id,
		});

		await prisma.trustedDevice.update({
			where: { id: trustedDevice.id },
			data: { lastUsedAt: new Date() },
		});
		await prisma.securityEventLog.create({
			data: {
				id: crypto.randomUUID(),
				userId: session.userId,
				event: 'remote_login_approved',
				userAgent: getUserAgent(req),
				details: {
					challengeId: approved.id,
					credentialId,
					trustedDeviceId: trustedDevice.id,
				},
			},
		});

		return Response.json({
			ok: true,
			challenge: {
				id: approved.id,
				status: approved.status,
				approvedAt: approved.approvedAt,
			},
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to approve trusted device login'),
			error.status ?? 400,
		);
	}
}
