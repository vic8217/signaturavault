import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import crypto from 'crypto';
import {
	isAllowedAccuraAuthorizationSource,
	isAllowedAccuraClientId,
	isAllowedAccuraRolePrefix,
	normalizeAccuraAuthorizationSource,
	normalizeAccuraClientId,
} from '@/lib/accuraAuthorization';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { buildExternalLoginReturnUrl } from '@/lib/externalLoginReturn';
import { normalizeExternalReturnUrl } from '@/lib/externalReturnUrl';
import { normalizeSignaturaId } from '@/lib/identity';
import { prisma } from '@/lib/prisma';
import { normalizeAccuraRolePrefix } from '@/lib/registrationSource';
import { LOGIN_CHALLENGE_STATUS } from '@/lib/trustedDeviceLoginChallenge';
import {
	assertSecureWebAuthnRequest,
	consumeChallenge,
	getOrigin,
	getRpID,
	getUserAgent,
} from '@/lib/webauthn';

function requesterOrigin(returnUrl) {
	try {
		return new URL(returnUrl).origin;
	} catch {
		return null;
	}
}

async function createConsumedSignaturaAssertion({
	tx,
	userId,
	credentialId,
	trustedDeviceId,
	returnUrl,
	expectedSignaturaId,
	rolePrefix,
	state,
	req,
}) {
	const now = new Date();
	return tx.trustedDeviceLoginChallenge.create({
		data: {
			userId,
				shortCode: 'AUTHOR',
				browserSecretHash: crypto.randomBytes(32).toString('hex'),
				nonce: crypto.randomBytes(32).toString('base64url'),
				clientId: 'accura',
				sourceApp: 'ACCURA',
				requesterOrigin: requesterOrigin(returnUrl),
				returnUrl,
				expectedSignaturaId,
				rolePrefix,
				state,
				requestedAssuranceLevel: 'ZT-L2',
				status: LOGIN_CHALLENGE_STATUS.CONSUMED,
			approvingDeviceId: trustedDeviceId,
			approvingCredentialId: credentialId,
			browserUserAgent: getUserAgent(req),
			nextPath: '/login/authorize',
			approvedAt: now,
			consumedAt: now,
			expiresAt: new Date(Date.now() + 90 * 1000),
		},
	});
}

export async function POST(req) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json().catch(() => ({}));
		const clientId = normalizeAccuraClientId(body.clientId);
		const source = normalizeAccuraAuthorizationSource(body.source);
		const returnUrl = normalizeExternalReturnUrl(body.returnUrl);
		const expectedSignaturaId = normalizeSignaturaId(body.expectedSignaturaId);
		const rolePrefix = normalizeAccuraRolePrefix(body.rolePrefix);
		const userId = String(body.userId || '');
		const assertion = body.response;
		const state = String(body.state || '').trim();

		if (!isAllowedAccuraClientId(clientId)) {
			return jsonError('Invalid ACCURA client', 400);
		}
		if (!isAllowedAccuraAuthorizationSource(source)) {
			return jsonError('Invalid source', 400);
		}
		if (!returnUrl) return jsonError('Return URL is not allowed', 400);
		if (!isAllowedAccuraRolePrefix(rolePrefix)) {
			return jsonError('Invalid ACCURA role prefix', 400);
		}
		if (!expectedSignaturaId) {
			return jsonError('Expected Signatura ID is required', 400);
		}
		if (!userId || !assertion) {
			return jsonError('userId and passkey response are required', 400);
		}

		const credential = await prisma.webAuthnCredential.findUnique({
			where: { credentialId: assertion.id },
			include: { user: true },
		});
		if (!credential || credential.userId !== userId || !credential.isTrusted) {
			return jsonError('Credential is not trusted for this account', 401);
		}
		if (credential.user.signaturaId !== expectedSignaturaId) {
			return jsonError('Signatura ID does not match ACCURA request', 403);
		}

		const appLink = await prisma.signaturaAppLink.findFirst({
			where: {
				userId,
				sourceApp: 'ACCURA',
				status: 'ACTIVE',
				...(rolePrefix ? { rolePrefix } : {}),
			},
			orderBy: { createdAt: 'desc' },
			select: { id: true },
		});
		if (!appLink) {
			return jsonError('ACCURA role link not found for this Signatura ID', 403);
		}

		const challenge = await prisma.authChallenge.findFirst({
			where: {
				userId,
				type: 'LOGIN_PASSKEY',
				usedAt: null,
				expiresAt: { gt: new Date() },
			},
			orderBy: { createdAt: 'desc' },
		});
		if (!challenge) {
			return jsonError('Login challenge expired or already used', 400);
		}

		const verification = await verifyAuthenticationResponse({
			response: assertion,
			expectedChallenge: challenge.challenge,
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

		await consumeChallenge({
			challenge: challenge.challenge,
			type: 'LOGIN_PASSKEY',
			userId,
		});

		if (!verification.verified) {
			return jsonError('Passkey authorization could not be verified', 401);
		}

		const credentialId = verification.authenticationInfo.credentialID;
		if (credentialId !== credential.credentialId) {
			return jsonError('Credential assertion does not match this account', 401);
		}

		const trustedDevice = await prisma.trustedDevice.findFirst({
			where: {
				userId,
				credentialId,
				isTrusted: true,
				removedAt: null,
				status: 'active',
			},
			select: { id: true },
		});
		if (!trustedDevice) {
			return jsonError('Trusted active device proof required', 403);
		}

		const now = new Date();
		const signaturaAssertion = await prisma.$transaction(async (tx) => {
			await tx.webAuthnCredential.update({
				where: { id: credential.id },
				data: {
					counter: verification.authenticationInfo.newCounter,
					lastUsedAt: now,
				},
			});
			await tx.trustedDevice.update({
				where: { id: trustedDevice.id },
				data: { lastUsedAt: now },
			});
			await tx.securityEventLog.create({
				data: {
					id: crypto.randomUUID(),
					userId,
					event: 'accura_login_authorized',
					userAgent: getUserAgent(req),
					details: {
						clientId: 'accura',
						credentialId,
						trustedDeviceId: trustedDevice.id,
						rolePrefix: rolePrefix || null,
					},
				},
			});
			return createConsumedSignaturaAssertion({
				tx,
				userId,
				credentialId,
					trustedDeviceId: trustedDevice.id,
					returnUrl,
					expectedSignaturaId,
					rolePrefix,
					state,
					req,
				});
		});

		const redirectUrl = buildExternalLoginReturnUrl(returnUrl, {
			signaturaId: credential.user.signaturaId,
			challengeId: signaturaAssertion.id,
			state,
		});
		if (!redirectUrl) {
			return jsonError('Unable to build ACCURA return URL', 400);
		}

		return Response.json({
			ok: true,
			signaturaId: credential.user.signaturaId,
			signaturaAssertion: signaturaAssertion.id,
			state,
			redirectUrl,
			expiresAt: signaturaAssertion.expiresAt,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to authorize ACCURA login'),
			error.status ?? 400,
		);
	}
}
