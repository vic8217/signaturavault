import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { userPublicIdentity } from '@/lib/identity';
import { setSessionCookie } from '@/lib/session';
import { normalizeLoginNextPath } from '@/lib/portalRoutes';
import { ROLE_COOKIE } from '@/lib/roles';
import { resolvePortalRole } from '@/lib/auth/loginSession';
import {
	assertSecureWebAuthnRequest,
	consumeChallenge,
	getOrigin,
	getRpID,
	getUserAgent,
	logSecurityEvent,
} from '@/lib/webauthn';

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json();
		const userId = String(body.userId || '');
		const nextPath = String(body.next || '');
		const response = body.response;

		if (!userId || !response) {
			return jsonError('userId and response are required');
		}

		const credential = await prisma.webAuthnCredential.findUnique({
			where: { credentialId: response.id },
			include: { user: true },
		});

		if (!credential || credential.userId !== userId || !credential.isTrusted) {
			return jsonError('Credential is not trusted for this account', 401);
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
			response,
			expectedChallenge: challenge.challenge,
			expectedOrigin: getOrigin(req),
			expectedRPID: getRpID(req),
			requireUserVerification: true,
			credential: {
				id: credential.credentialId,
				publicKey: credential.publicKey,
				counter: credential.counter,
				transports: credential.transports as never,
			},
		});

		await consumeChallenge({
			challenge: challenge.challenge,
			type: 'LOGIN_PASSKEY',
			userId,
		});

		if (!verification.verified) {
			await logSecurityEvent(req, 'login_verification_failed', userId);
			return jsonError('Passkey login could not be verified', 401);
		}

		const now = new Date();
		await prisma.$transaction([
			prisma.webAuthnCredential.update({
				where: { id: credential.id },
				data: {
					counter: verification.authenticationInfo.newCounter,
					lastUsedAt: now,
				},
			}),
			prisma.trustedDevice.updateMany({
				where: {
					userId,
					credentialId: credential.credentialId,
					removedAt: null,
				},
				data: { lastUsedAt: now },
			}),
			prisma.securityEventLog.create({
				data: {
					id: crypto.randomUUID(),
					userId,
					event: 'passkey_login_succeeded',
					userAgent: getUserAgent(req),
					details: { credentialId: credential.credentialId },
				},
			}),
		]);

		const allowedNext = normalizeLoginNextPath(
			nextPath.startsWith('/') ? nextPath : '/signatura/dashboard',
		);
		let portalRole = null;

		try {
			portalRole = await resolvePortalRole(credential.user.id, allowedNext);
		} catch (roleError) {
			const status =
				typeof roleError === 'object' &&
				roleError !== null &&
				'status' in roleError &&
				typeof roleError.status === 'number'
					? roleError.status
					: 403;
			return jsonError(
				roleError instanceof Error
					? roleError.message
					: 'Unable to resolve portal role',
				status,
			);
		}

		const responseJson = NextResponse.json({
			ok: true,
			next: allowedNext,
			user: {
				...userPublicIdentity(credential.user),
			},
		});
		setSessionCookie(responseJson, req, {
			userId: credential.user.id,
			signaturaId: credential.user.signaturaId,
			role: portalRole,
			trustLevel: credential.user.trustLevel,
			iat: Date.now(),
			createdAt: Date.now(),
			reauthenticatedAt: Date.now(),
		});
		if (portalRole) {
			responseJson.cookies.set(ROLE_COOKIE, portalRole, {
				httpOnly: true,
				sameSite: 'lax',
				secure: process.env.NODE_ENV === 'production',
				path: '/',
				maxAge: 60 * 60 * 8,
			});
		}

		return responseJson;
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to finish login'),
			400,
		);
	}
}
