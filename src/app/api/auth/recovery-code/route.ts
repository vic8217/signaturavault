import { NextResponse } from 'next/server';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { logAuthAudit } from '@/lib/auth/authAudit';
import {
	enforceRateLimit,
	rateLimitKey,
	rateLimitResponse,
} from '@/lib/auth/rateLimit';
import {
	hashRecoveryPhrase,
	normalizeRecoveryPhrase,
} from '@/lib/auth/recoveryPhrase';
import { normalizeSignaturaId } from '@/lib/identity';
import { prisma } from '@/lib/prisma';
import { normalizeLoginNextPath } from '@/lib/portalRoutes';
import {
	ROLE_COOKIE,
	ROLES,
	isDocumentOwnerPath,
	isIssuerPortalPath,
} from '@/lib/roles';
import { setSessionCookie } from '@/lib/session';
import { hashRecoveryCode } from '@/lib/webauthn';

function normalizeRecoveryInput(code: string) {
	const trimmed = String(code || '').trim();
	if (trimmed.includes(' ')) {
		return normalizeRecoveryPhrase(trimmed);
	}
	return trimmed.toUpperCase().replace(/\s+/g, '');
}

function hashRecoveryInput(code: string) {
	const normalized = normalizeRecoveryInput(code);
	if (normalized.includes(' ')) {
		return hashRecoveryPhrase(normalized);
	}
	return hashRecoveryCode(normalized);
}

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const signaturaId = normalizeSignaturaId(body.signaturaId || body.userId);
		const recoveryInput = String(
			body.recoveryPhrase || body.recoveryCode || '',
		);
		const requestedNext = String(body.next || '');
		const nextPath = normalizeLoginNextPath(
			requestedNext.startsWith('/') ? requestedNext : '/signatura/trusted-devices',
		);

		if (!signaturaId || !recoveryInput.trim()) {
			return jsonError('Signatura ID and recovery phrase are required');
		}

		const limited = enforceRateLimit(
			rateLimitKey(req, 'recovery_phrase_attempt', signaturaId),
			{ max: 8, windowMs: 15 * 60 * 1000 },
		);
		if (limited) return rateLimitResponse(limited.retryAfterMs);

		const user = await prisma.user.findUnique({
			where: { signaturaId },
			select: { id: true, signaturaId: true, trustLevel: true },
		});

		if (!user) {
			await logAuthAudit(req, 'recovery_phrase_failed', {
				result: 'denied',
				details: { reason: 'unknown_signatura_id' },
			});
			return jsonError('Recovery phrase is invalid or already used', 401);
		}

		const codeHash = hashRecoveryInput(recoveryInput);
		const recoveryCodeRecord = await prisma.recoveryCode.findFirst({
			where: {
				userId: user.id,
				codeHash,
				usedAt: null,
			},
			select: { id: true },
		});

		if (!recoveryCodeRecord) {
			await logAuthAudit(req, 'recovery_phrase_failed', {
				userId: user.id,
				result: 'denied',
				details: { reason: 'invalid_or_used_phrase' },
			});
			return jsonError('Recovery phrase is invalid or already used', 401);
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
				throw new Error('Recovery phrase was already used');
			}
		});

		await logAuthAudit(req, 'recovery_phrase_succeeded', {
			userId: user.id,
			details: {
				nextPath,
				requiresNewTrustedDevice: true,
			},
		});

		let portalRole = null;
		if (isIssuerPortalPath(nextPath)) {
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
		} else if (isDocumentOwnerPath(nextPath)) {
			portalRole = ROLES.DOCUMENT_OWNER;
		}

		const response = NextResponse.json({
			ok: true,
			next: `/signatura/trusted-devices/add-passkey?recovered=1&next=${encodeURIComponent(
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
			safeApiErrorMessage(error, 'Unable to verify recovery phrase'),
			400,
		);
	}
}
