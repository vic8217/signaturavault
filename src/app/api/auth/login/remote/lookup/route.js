import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import {
	QR_LOGIN_APPROVAL_TIMEOUT_MS,
	getTrustedDeviceLoginApprovalMaterial,
} from '@/lib/trustedDeviceLoginChallenge';
import { assertSecureWebAuthnRequest, getRpID } from '@/lib/webauthn';

export async function GET(req) {
	try {
		assertSecureWebAuthnRequest(req);
		const session = await requireSession();
		if (!session?.userId) return jsonError('Authentication required', 401);

		const url = new URL(req.url);
		const challengeId = String(url.searchParams.get('cid') ?? '').trim();
		const shortCode = String(url.searchParams.get('code') ?? '')
			.trim()
			.toUpperCase();
		if (!challengeId || !shortCode) {
			return jsonError('Challenge id and code are required', 400);
		}

		const challenge = await getTrustedDeviceLoginApprovalMaterial({
			challengeId,
			shortCode,
			approverUserId: session.userId,
		});
		if (!challenge) {
			return jsonError('Login challenge not found or expired', 404);
		}

		const activeDevices = await prisma.trustedDevice.findMany({
			where: {
				userId: session.userId,
				isTrusted: true,
				removedAt: null,
				status: 'active',
			},
			select: { credentialId: true },
		});
		const credentialIds = activeDevices
			.map((device) => device.credentialId)
			.filter(Boolean);
		if (credentialIds.length === 0) {
			return jsonError('Trusted active device proof required', 403);
		}

		const credentials = await prisma.webAuthnCredential.findMany({
			where: {
				userId: session.userId,
				isTrusted: true,
				credentialId: { in: credentialIds },
			},
			select: { credentialId: true, transports: true },
		});
		if (credentials.length === 0) {
			return jsonError('Trusted active passkey required', 403);
		}

		const options = await generateAuthenticationOptions({
			rpID: getRpID(req),
			userVerification: 'required',
			timeout: QR_LOGIN_APPROVAL_TIMEOUT_MS,
			challenge: Buffer.from(challenge.approvalChallenge.challenge, 'base64url'),
			allowCredentials: credentials.map((credential) => ({
				id: credential.credentialId,
				transports: credential.transports,
			})),
		});

		return Response.json({
			ok: true,
			challenge: {
				id: challenge.id,
				shortCode: challenge.shortCode,
				signaturaId: challenge.signaturaId,
				status: challenge.status,
				expiresAt: challenge.expiresAt,
			},
			options,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to look up login challenge'),
			error.status ?? 400,
		);
	}
}
