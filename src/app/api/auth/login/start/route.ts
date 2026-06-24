import { generateAuthenticationOptions } from '@simplewebauthn/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { normalizeSignaturaId } from '@/lib/identity';
import { normalizeLoginNextPath } from '@/lib/portalRoutes';
import {
	assertSecureWebAuthnRequest,
	challengeExpiresAt,
	getRpID,
	getUserAgent,
	logSecurityEvent,
} from '@/lib/webauthn';

function isAdminPath(value: string) {
	return value === '/admin' || value.startsWith('/admin/');
}

function isBase64UrlCredentialId(value: string) {
	return /^[A-Za-z0-9_-]+$/.test(value);
}

function isLocalPlatformCredential(credential: { transports?: string[] | null }) {
	const transports = Array.isArray(credential.transports)
		? credential.transports.map((transport) => String(transport).toLowerCase())
		: [];
	return transports.includes('internal') && !transports.includes('hybrid');
}

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json().catch(() => ({}));
		const signaturaId = normalizeSignaturaId(body.signaturaId || body.userId);
		const nextPath = normalizeLoginNextPath(
			typeof body.next === 'string' && body.next.startsWith('/')
				? body.next
				: '/signatura/dashboard',
		);
		const requireLocalPlatformCredential = isAdminPath(nextPath);

		if (!signaturaId) {
			return jsonError('Signatura ID is required');
		}

		const user = await prisma.user.findUnique({
			where: { signaturaId },
			include: { credentials: { where: { isTrusted: true } } },
		});

		const trustedCredentials = (user?.credentials || []).filter((credential) =>
			isBase64UrlCredentialId(String(credential.credentialId || '')),
		);
		const allowedCredentials = requireLocalPlatformCredential
			? trustedCredentials.filter(isLocalPlatformCredential)
			: trustedCredentials;

		if (!user || allowedCredentials.length === 0) {
			return jsonError(
				requireLocalPlatformCredential
					? 'Admin sign-in requires a local passkey registered on this device. Cross-device phone QR passkeys are not allowed for admin access.'
					: 'No passkey is registered for this account',
				404,
			);
		}

		const options = await generateAuthenticationOptions({
			rpID: getRpID(req),
			userVerification: 'required',
			timeout: 60000,
			allowCredentials: allowedCredentials.map((credential) => ({
				id: credential.credentialId,
				transports: requireLocalPlatformCredential
					? ['internal']
					: (credential.transports as never),
			})),
		});

		await prisma.authChallenge.create({
			data: {
				id: crypto.randomUUID(),
				userId: user.id,
				type: 'LOGIN_PASSKEY',
				challenge: options.challenge,
				userAgent: getUserAgent(req),
				expiresAt: challengeExpiresAt(),
			},
		});

		await logSecurityEvent(req, 'login_challenge_created', user.id);

		return Response.json(
			{ userId: user.id, signaturaId: user.signaturaId, options },
			{
				headers: { 'content-type': 'application/json; charset=utf-8' },
			},
		);
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to start login'),
			400,
		);
	}
}
