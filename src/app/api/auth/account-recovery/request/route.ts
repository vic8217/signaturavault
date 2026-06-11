import crypto from 'crypto';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { logAuthAudit } from '@/lib/auth/authAudit';
import {
	enforceRateLimit,
	rateLimitKey,
	rateLimitResponse,
} from '@/lib/auth/rateLimit';
import { accountLookupHashes } from '@/lib/account-private-fields';
import { normalizeSignaturaId } from '@/lib/identity';
import { prisma } from '@/lib/prisma';
import { getUserAgent } from '@/lib/webauthn';

const RECOVERY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
	try {
		const limited = enforceRateLimit(
			rateLimitKey(req, 'account_recovery_request'),
			{ max: 5, windowMs: 60 * 60 * 1000 },
		);
		if (limited) return rateLimitResponse(limited.retryAfterMs);

		const body = await req.json().catch(() => ({}));
		const signaturaId = normalizeSignaturaId(body.signaturaId || body.userId);
		const email = String(body.email || '').trim();
		const handphone = String(body.handphone || body.mobile || '').trim();
		const livenessAcknowledged = Boolean(body.livenessAcknowledged);

		if (!signaturaId || !email || !handphone) {
			return jsonError(
				'Signatura ID, verified email, and handphone number are required',
				400,
			);
		}
		if (!livenessAcknowledged) {
			return jsonError(
				'Selfie and liveness verification must be completed before submitting',
				400,
			);
		}

		const user = await prisma.user.findUnique({
			where: { signaturaId },
			select: {
				id: true,
				signaturaId: true,
				emailLookupHash: true,
				mobileLookupHash: true,
			},
		});

		if (!user) {
			await logAuthAudit(req, 'account_recovery_request_failed', {
				result: 'denied',
				details: { reason: 'unknown_signatura_id' },
			});
			return jsonError(
				'Account recovery request received. Review will begin after the cooldown period.',
				202,
			);
		}

		const { emailLookupHash: emailHash, mobileLookupHash: mobileHash } =
			accountLookupHashes({ email, handphone });
		const contactMatches =
			user.emailLookupHash === emailHash &&
			user.mobileLookupHash === mobileHash;

		const cooldownUntil = new Date(Date.now() + RECOVERY_COOLDOWN_MS);
		const request = await prisma.accountRecoveryRequest.create({
			data: {
				userId: user.id,
				signaturaId: user.signaturaId,
				emailLookupHash: emailHash,
				mobileLookupHash: mobileHash,
				status: contactMatches ? 'COOLDOWN' : 'REJECTED',
				cooldownUntil: contactMatches ? cooldownUntil : null,
				livenessStatus: 'submitted',
				ipAddress:
					req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
					req.headers.get('x-real-ip') ||
					null,
				userAgent: getUserAgent(req),
			},
		});

		await logAuthAudit(req, 'account_recovery_requested', {
			userId: user.id,
			result: contactMatches ? 'success' : 'denied',
			details: {
				requestId: request.id,
				status: request.status,
				cooldownUntil: request.cooldownUntil?.toISOString() || null,
			},
		});

		return Response.json({
			ok: true,
			status: request.status,
			cooldownUntil: request.cooldownUntil,
			message:
				request.status === 'COOLDOWN'
					? 'Identity recovery request accepted. Access review begins after the cooldown period.'
					: 'Submitted contact details did not match the encrypted account record.',
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to submit account recovery request'),
			400,
		);
	}
}
