import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { normalizeSignaturaId } from '@/lib/identity';
import { prisma } from '@/lib/prisma';
import { ROLE_COOKIE, ROLES } from '@/lib/roles';
import { setSessionCookie } from '@/lib/session';
import { getUserAgent, hashRecoveryCode } from '@/lib/webauthn';

function normalizeRecoveryCode(code: string) {
	return code.trim().toUpperCase().replace(/\s+/g, '');
}

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const signaturaId = normalizeSignaturaId(body.signaturaId || body.userId);
		const recoveryCode = normalizeRecoveryCode(String(body.recoveryCode || ''));
		const requestedNext = String(body.next || '');
		const nextPath = requestedNext.startsWith('/')
			? requestedNext
			: '/security/devices';

		if (!signaturaId || !recoveryCode) {
			return jsonError('Signatura ID and recovery code are required');
		}

		const user = await prisma.user.findUnique({
			where: { signaturaId },
			select: { id: true, signaturaId: true, trustLevel: true },
		});

		if (!user) {
			return jsonError('Recovery code is invalid or already used', 401);
		}

		const codeHash = hashRecoveryCode(recoveryCode);
		const recoveryCodeRecord = await prisma.recoveryCode.findFirst({
			where: {
				userId: user.id,
				codeHash,
				usedAt: null,
			},
			select: { id: true },
		});

		if (!recoveryCodeRecord) {
			await prisma.securityEventLog.create({
				data: {
					id: crypto.randomUUID(),
					userId: user.id,
					event: 'recovery_code_failed',
					userAgent: getUserAgent(req),
					details: { reason: 'invalid_or_used_code' },
				},
			});
			return jsonError('Recovery code is invalid or already used', 401);
		}

		const now = new Date();
		await prisma.$transaction(async (tx) => {
			const usedCode = await tx.recoveryCode.updateMany({
				where: {
					id: recoveryCodeRecord.id,
					usedAt: null,
				},
				data: { usedAt: now },
			});

			if (usedCode.count !== 1) {
				throw new Error('Recovery code was already used');
			}

			await tx.securityEventLog.create({
				data: {
					id: crypto.randomUUID(),
					userId: user.id,
					event: 'recovery_code_succeeded',
					userAgent: getUserAgent(req),
					details: {
						nextPath,
						requiresNewTrustedDevice: true,
					},
				},
			});
		});

		let portalRole = null;
		if (nextPath === '/issuer-portal') {
			const issuerUser = await prisma.issuerUser.findFirst({
				where: {
					userId: user.id,
					status: 'active',
				},
				orderBy: { activatedAt: 'desc' },
			});

			if (issuerUser) {
				portalRole =
					issuerUser.role === ROLES.ISSUER_ADMIN
						? ROLES.ISSUER_ADMIN
						: ROLES.ISSUER_STAFF;
			}
		} else if (nextPath === '/wallet' || nextPath.startsWith('/wallet/')) {
			portalRole = ROLES.DOCUMENT_OWNER;
		}

		const response = NextResponse.json({
			ok: true,
			next: `/security/add-passkey?recovered=1&next=${encodeURIComponent(
				nextPath,
			)}`,
		});

		setSessionCookie(response, req, {
			userId: user.id,
			signaturaId: user.signaturaId,
			role: portalRole,
			trustLevel: user.trustLevel,
			iat: Date.now(),
			createdAt: Date.now(),
			reauthenticatedAt: Date.now(),
		});

		if (portalRole) {
			response.cookies.set(ROLE_COOKIE, portalRole, {
				httpOnly: true,
				sameSite: 'lax',
				secure: process.env.NODE_ENV === 'production',
				path: '/',
				maxAge: 60 * 60 * 8,
			});
		}

		return response;
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to verify recovery code'),
			400,
		);
	}
}
