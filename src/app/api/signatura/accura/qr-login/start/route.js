import crypto from 'crypto';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { logAuthAudit } from '@/lib/auth/authAudit';
import {
	ACCURA_QR_LOGIN_CHALLENGE_TYPE,
	normalizeChallengeId,
	normalizeShortCode,
} from '@/lib/accuraQrLogin';
import { fetchAccuraQrLoginChallenge } from '@/lib/accuraQrLoginService';
import { requireActiveAccuraWalletAccount } from '@/lib/accuraQrWallet';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import {
	assertSecureWebAuthnRequest,
	challengeExpiresAt,
	getRpID,
	getUserAgent,
} from '@/lib/webauthn';

export async function POST(req) {
	try {
		assertSecureWebAuthnRequest(req);
		const session = await requireSession();
		if (!session?.userId) return jsonError('Authentication required', 401);

		const body = await req.json().catch(() => ({}));
		const challengeId = normalizeChallengeId(body.challengeId);
		const shortCode = normalizeShortCode(body.shortCode);
		const walletAccountId = String(body.walletAccountId || '').trim();
		if (!challengeId || !shortCode || !walletAccountId) {
			return jsonError('Challenge, short code, and ACCURA account are required', 400);
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
		const credentials = await prisma.webAuthnCredential.findMany({
			where: {
				userId: session.userId,
				isTrusted: true,
				credentialId: { in: credentialIds },
			},
		});
		if (credentials.length === 0) {
			return jsonError('An active trusted device with a passkey is required', 403);
		}

		const options = await generateAuthenticationOptions({
			rpID: getRpID(req),
			userVerification: 'required',
			timeout: 90_000,
			allowCredentials: credentials.map((credential) => ({
				id: credential.credentialId,
				transports: credential.transports,
			})),
		});
		await prisma.authChallenge.create({
			data: {
				id: crypto.randomUUID(),
				userId: session.userId,
				type: ACCURA_QR_LOGIN_CHALLENGE_TYPE,
				challenge: options.challenge,
				deviceName: JSON.stringify({
					challengeId,
					shortCode,
					walletAccountId: account.id,
					signaturaId: account.signaturaId,
				}),
				userAgent: getUserAgent(req),
				expiresAt: challengeExpiresAt(),
			},
		});
		await logAuthAudit(req, 'accura_qr_wallet_account_selected', {
			userId: session.userId,
			details: {
				challengeId,
				walletAccountId: account.id,
				signaturaId: account.signaturaId,
			},
		});
		return Response.json({ ok: true, options });
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to start ACCURA login approval'),
			error.status ?? 400,
		);
	}
}
