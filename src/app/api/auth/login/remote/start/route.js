import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { logAuthAudit } from '@/lib/auth/authAudit';
import {
	enforceRateLimit,
	rateLimitKey,
	rateLimitResponse,
} from '@/lib/auth/rateLimit';
import { normalizeSignaturaId } from '@/lib/identity';
import { prisma } from '@/lib/prisma';
import { normalizeLoginNextPath } from '@/lib/portalRoutes';
import {
	buildRemoteLoginQrUrl,
	createTrustedDeviceLoginChallenge,
} from '@/lib/trustedDeviceLoginChallenge';
import { getOrigin, getUserAgent } from '@/lib/webauthn';

const KNOWN_SOURCE_APPS = new Set(['ACCURA', 'HAVEN', 'SIGNATURA']);

function normalizeOptionalText(value) {
	const normalized = String(value || '').trim();
	return normalized || null;
}

function normalizeSourceApp(value) {
	const normalized = String(value || 'SIGNATURA').trim().toUpperCase();
	return KNOWN_SOURCE_APPS.has(normalized) ? normalized : 'SIGNATURA';
}

function normalizeAssuranceLevel(value) {
	const normalized = String(value || 'ZT-L2').trim().toUpperCase();
	return normalized || 'ZT-L2';
}

export async function POST(req) {
	try {
		const body = await req.json().catch(() => ({}));
		const signaturaId = normalizeSignaturaId(body.signaturaId || body.userId);
		const limited = enforceRateLimit(
			rateLimitKey(req, 'qr_login_start', signaturaId || 'missing'),
			{ max: 12, windowMs: 10 * 60 * 1000 },
		);
		if (limited) return rateLimitResponse(limited.retryAfterMs);
		const nextPath = normalizeLoginNextPath(
			typeof body.next === 'string' && body.next.startsWith('/')
				? body.next
				: '/signatura/dashboard',
		);

		if (!signaturaId) {
			return jsonError('Signatura ID is required', 400);
		}

		const user = await prisma.user.findUnique({
			where: { signaturaId },
			select: {
				id: true,
				signaturaId: true,
				trustedDevices: {
					where: {
						isTrusted: true,
						removedAt: null,
						status: 'active',
						credentialId: { not: null },
					},
					select: { id: true },
				},
			},
		});

		if (!user) {
			await logAuthAudit(req, 'login_signatura_id_lookup_failed', {
				result: 'denied',
				details: { signaturaId },
			});
			return jsonError('Signatura ID not found', 404);
		}
		if (user.trustedDevices.length === 0) {
			return jsonError(
				'No trusted device is registered for this Signatura ID. Register a trusted device first.',
				404,
			);
		}

		const { challenge, browserSecret } = await createTrustedDeviceLoginChallenge({
			userId: user.id,
			nextPath,
			browserUserAgent: getUserAgent(req),
			clientId: normalizeOptionalText(body.clientId),
			sourceApp: normalizeSourceApp(body.sourceApp || body.source),
			requesterOrigin: normalizeOptionalText(body.requesterOrigin) || getOrigin(req),
			requestedAssuranceLevel: normalizeAssuranceLevel(
				body.requestedAssuranceLevel,
			),
		});

		await logAuthAudit(req, 'qr_login_challenge_created', {
			userId: user.id,
			details: {
				challengeId: challenge.id,
				expiresAt: challenge.expiresAt,
			},
		});

		const origin = getOrigin(req);
		return Response.json({
			ok: true,
			challengeId: challenge.id,
			shortCode: challenge.shortCode,
			browserSecret,
			expiresAt: challenge.expiresAt,
			qrUrl: buildRemoteLoginQrUrl(origin, challenge.id, challenge.shortCode),
			signaturaId: user.signaturaId,
			trustedDeviceCount: user.trustedDevices.length,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to start trusted device login'),
			error.status ?? 400,
		);
	}
}
