import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import crypto from 'crypto';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import {
	approveTrustedDeviceLoginChallenge,
	buildQrLoginApprovalChallenge,
	findPendingTrustedDeviceLoginChallenge,
	requireTrustedActiveLoginDevice,
} from '@/lib/trustedDeviceLoginChallenge';
import {
	assertSecureWebAuthnRequest,
	getOrigin,
	getRpID,
	getUserAgent,
} from '@/lib/webauthn';

export async function POST(req) {
	try {
		assertSecureWebAuthnRequest(req);
		const session = await requireSession();
		if (!session?.userId) return jsonError('Authentication required', 401);

		const body = await req.json().catch(() => ({}));
		const challengeId = String(body.challengeId ?? '').trim();
		const shortCode = String(body.shortCode ?? '').trim().toUpperCase();
		const deviceBindingSecret = String(body.deviceBindingSecret ?? '').trim();
		const assertion = body.response;
		if (!challengeId || !shortCode) {
			return jsonError('Challenge and code are required', 400);
		}
		if (!assertion) {
			return jsonError('WebAuthn assertion is required', 400);
		}
		if (!deviceBindingSecret) {
			return jsonError(
				'This phone is not registered for QR approval. Register it as a trusted device first.',
				403,
			);
		}

		const challenge = await findPendingTrustedDeviceLoginChallenge({
			challengeId,
			shortCode,
		});
		if (!challenge) {
			return jsonError('Login challenge not found or expired', 404);
		}
		if (challenge.userId !== session.userId) {
			return jsonError(
				'This Signatura account does not match the browser login request.',
				403,
			);
		}

		const approver = await prisma.user.findUnique({
			where: { id: session.userId },
			select: { signaturaId: true },
		});
		if (
			challenge.expectedSignaturaId &&
			approver?.signaturaId !== challenge.expectedSignaturaId
		) {
			return jsonError('This login request is for a different Signatura ID', 403);
		}

		const candidateCredential = await prisma.webAuthnCredential.findUnique({
			where: { credentialId: assertion.id },
		});
		if (!candidateCredential || candidateCredential.userId !== session.userId) {
			return jsonError('Credential is not registered for this account', 401);
		}

		const expectedChallenge = buildQrLoginApprovalChallenge(challenge).challenge;
		const verification = await verifyAuthenticationResponse({
			response: assertion,
			expectedChallenge,
			expectedOrigin: getOrigin(req),
			expectedRPID: getRpID(req),
			requireUserVerification: true,
			credential: {
				id: candidateCredential.credentialId,
				publicKey: candidateCredential.publicKey,
				counter: candidateCredential.counter,
				transports: candidateCredential.transports,
			},
		});
		if (!verification.verified) {
			return jsonError('Trusted device assertion could not be verified', 401);
		}

		const credentialId = verification.authenticationInfo.credentialID;
		if (
			credentialId !== candidateCredential.credentialId ||
			!candidateCredential.isTrusted
		) {
			return jsonError('Credential is not trusted for this account', 401);
		}

		const trustedDevice = await requireTrustedActiveLoginDevice({
			userId: session.userId,
			credentialId,
			deviceBindingSecret,
		});

		const approved = await approveTrustedDeviceLoginChallenge({
			challengeId,
			shortCode,
			approverUserId: session.userId,
			credentialId,
			trustedDeviceId: trustedDevice.id,
		});

		await prisma.webAuthnCredential.update({
			where: { id: candidateCredential.id },
			data: {
				counter: verification.authenticationInfo.newCounter,
				lastUsedAt: new Date(),
			},
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
