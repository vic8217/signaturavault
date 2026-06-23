import crypto from 'crypto';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { logAuthAudit } from '@/lib/auth/authAudit';
import {
	ACCURA_QR_APP,
	ACCURA_QR_LOGIN_CHALLENGE_TYPE,
	issueAccuraQrLoginProof,
	normalizeChallengeId,
	normalizeShortCode,
} from '@/lib/accuraQrLogin';
import {
	fetchAccuraQrLoginChallenge,
	postAccuraQrLoginApproval,
} from '@/lib/accuraQrLoginService';
import { requireActiveAccuraWalletAccount } from '@/lib/accuraQrWallet';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import {
	assertSecureWebAuthnRequest,
	getOrigin,
	getRpID,
	getUserAgent,
} from '@/lib/webauthn';

function challengeMetadata(challenge) {
	try {
		return JSON.parse(challenge.deviceName || '{}');
	} catch {
		return {};
	}
}

export async function POST(req) {
	let session = null;
	let challengeId = '';
	try {
		assertSecureWebAuthnRequest(req);
		session = await requireSession();
		if (!session?.userId) return jsonError('Authentication required', 401);

		const body = await req.json().catch(() => ({}));
		challengeId = normalizeChallengeId(body.challengeId);
		const shortCode = normalizeShortCode(body.shortCode);
		const walletAccountId = String(body.walletAccountId || '').trim();
		const assertion = body.response;
		if (!challengeId || !shortCode || !walletAccountId || !assertion) {
			return jsonError(
				'Challenge, short code, ACCURA account, and passkey approval are required',
				400,
			);
		}

		const challenge = await fetchAccuraQrLoginChallenge({ challengeId, shortCode });
		const account = await requireActiveAccuraWalletAccount({
			userId: session.userId,
			walletAccountId,
		});
		if (
			challenge.expectedRolePrefix &&
			account.rolePrefix !== challenge.expectedRolePrefix
		) {
			return jsonError(
				`This ACCURA login requires a ${challenge.expectedRolePrefix} Signatura ID`,
				403,
			);
		}
		if (
			challenge.expectedSignaturaId &&
			account.signaturaId !== challenge.expectedSignaturaId
		) {
			return jsonError(
				'This ACCURA login request is for a different Signatura ID',
				403,
			);
		}
		if (
			account.trustedDeviceStatus &&
			String(account.trustedDeviceStatus).toUpperCase() !== 'TRUSTED'
		) {
			return jsonError('The selected ACCURA wallet account is not trusted', 403);
		}

		const authChallenge = await prisma.authChallenge.findFirst({
			where: {
				userId: session.userId,
				type: ACCURA_QR_LOGIN_CHALLENGE_TYPE,
				usedAt: null,
				expiresAt: { gt: new Date() },
			},
			orderBy: { createdAt: 'desc' },
		});
		if (!authChallenge) {
			return jsonError('ACCURA login approval expired. Start again.', 410);
		}
		const metadata = challengeMetadata(authChallenge);
		if (
			metadata.challengeId !== challengeId ||
			metadata.shortCode !== shortCode ||
			metadata.walletAccountId !== account.id ||
			metadata.signaturaId !== account.signaturaId
		) {
			return jsonError('ACCURA login approval does not match the selected account', 403);
		}

		const credential = await prisma.webAuthnCredential.findUnique({
			where: { credentialId: String(assertion.id || '') },
		});
		if (
			!credential ||
			credential.userId !== session.userId ||
			!credential.isTrusted
		) {
			return jsonError('Passkey is not trusted for this wallet account', 401);
		}
		const trustedDevice = await prisma.trustedDevice.findFirst({
			where: {
				userId: session.userId,
				credentialId: credential.credentialId,
				isTrusted: true,
				removedAt: null,
				status: 'active',
			},
		});
		if (!trustedDevice) {
			return jsonError('The approving trusted device is inactive', 403);
		}

		const verification = await verifyAuthenticationResponse({
			response: assertion,
			expectedChallenge: authChallenge.challenge,
			expectedOrigin: getOrigin(req),
			expectedRPID: getRpID(req),
			requireUserVerification: true,
			credential: {
				id: credential.credentialId,
				publicKey: credential.publicKey,
				counter: credential.counter,
				transports: credential.transports,
			},
		});
		if (!verification.verified) {
			return jsonError('Passkey or biometric approval failed', 401);
		}

		const claimed = await prisma.authChallenge.updateMany({
			where: {
				id: authChallenge.id,
				usedAt: null,
				expiresAt: { gt: new Date() },
			},
			data: { usedAt: new Date() },
		});
		if (claimed.count !== 1) {
			return jsonError('This ACCURA login request was already approved', 409);
		}

		const approvedAt = new Date().toISOString();
		const signed = issueAccuraQrLoginProof({
			challengeId,
			shortCode,
			signaturaId: account.signaturaId,
			companyCode: account.companyCode,
			rolePrefix: account.rolePrefix,
			walletAccountId: account.id,
			assertionId: authChallenge.id,
			approvedAt,
		});
		const approvalPayload = {
			app: ACCURA_QR_APP,
			challengeId,
			shortCode,
			signaturaId: account.signaturaId,
			companyCode: account.companyCode,
			rolePrefix: account.rolePrefix,
			active: true,
			approvedAt,
			assertionId: authChallenge.id,
			assertionOrProof: signed.proof,
			walletAccountId: account.id,
		};
		await postAccuraQrLoginApproval(approvalPayload);

		await prisma.$transaction([
			prisma.webAuthnCredential.update({
				where: { id: credential.id },
				data: {
					counter: verification.authenticationInfo.newCounter,
					lastUsedAt: new Date(),
				},
			}),
			prisma.trustedDevice.update({
				where: { id: trustedDevice.id },
				data: { lastUsedAt: new Date() },
			}),
			prisma.securityEventLog.create({
				data: {
					id: crypto.randomUUID(),
					userId: session.userId,
					event: 'accura_qr_login_approved',
					userAgent: getUserAgent(req),
					details: {
						challengeId,
						signaturaId: account.signaturaId,
						walletAccountId: account.id,
						credentialId: credential.credentialId,
						trustedDeviceId: trustedDevice.id,
					},
				},
			}),
		]);
		await logAuthAudit(req, 'accura_qr_login_approved', {
			userId: session.userId,
			details: {
				challengeId,
				signaturaId: account.signaturaId,
				walletAccountId: account.id,
			},
		});

		return Response.json({
			ok: true,
			status: 'APPROVED',
			approvedAt,
		});
	} catch (error) {
		if (session?.userId) {
			await logAuthAudit(req, 'accura_qr_login_failed', {
				userId: session.userId,
				result: 'failed',
				details: {
					challengeId,
					reason: error instanceof Error ? error.message : 'approval_failed',
				},
			}).catch(() => null);
		}
		return jsonError(
			safeApiErrorMessage(error, 'Unable to approve ACCURA login'),
			error.status ?? 400,
		);
	}
}
