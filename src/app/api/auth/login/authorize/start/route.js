import {
	isAllowedAccuraAuthorizationSource,
	isAllowedAccuraClientId,
	isAllowedAccuraRolePrefix,
	normalizeAccuraAuthorizationSource,
	normalizeAccuraClientId,
} from '@/lib/accuraAuthorization';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { logAuthAudit } from '@/lib/auth/authAudit';
import {
	enforceRateLimit,
	rateLimitKey,
	rateLimitResponse,
} from '@/lib/auth/rateLimit';
import { normalizeSignaturaId } from '@/lib/identity';
import { prisma } from '@/lib/prisma';
import { resolveAccuraAuthorizationRolePrefix } from '@/lib/registrationSource';
import { normalizeExternalReturnUrl } from '@/lib/externalReturnUrl';
import {
	ACCURA_AUTHORIZE_CHALLENGE_TTL_MS,
	buildRemoteLoginQrUrl,
	createTrustedDeviceLoginChallenge,
} from '@/lib/trustedDeviceLoginChallenge';
import {
	assertPhoneReachableSignaturaOrigin,
} from '@/lib/publicOrigin';
import { getOrigin, getUserAgent } from '@/lib/webauthn';

export async function POST(req) {
	try {
		const body = await req.json().catch(() => ({}));
		const clientId = normalizeAccuraClientId(body.clientId);
		const source = normalizeAccuraAuthorizationSource(body.source);
		const returnUrl = normalizeExternalReturnUrl(body.returnUrl);
		const expectedSignaturaId = normalizeSignaturaId(body.expectedSignaturaId);
		const rolePrefix = resolveAccuraAuthorizationRolePrefix(
			body.rolePrefix,
			expectedSignaturaId,
		);
		const state = String(body.state || '').trim();

		if (!isAllowedAccuraClientId(clientId)) {
			return jsonError('Invalid ACCURA client', 400);
		}
		if (!isAllowedAccuraAuthorizationSource(source)) {
			return jsonError('Invalid source', 400);
		}
		if (!returnUrl) {
			return jsonError('Return URL is not allowed', 400);
		}
		if (!isAllowedAccuraRolePrefix(rolePrefix)) {
			return jsonError('Invalid ACCURA role prefix', 400);
		}
		if (!expectedSignaturaId) {
			return jsonError('Expected Signatura ID is required', 400);
		}

		const limited = enforceRateLimit(
			rateLimitKey(req, 'accura_authorize_start', expectedSignaturaId),
			{ max: 12, windowMs: 10 * 60 * 1000 },
		);
		if (limited) return rateLimitResponse(limited.retryAfterMs);

		const user = await prisma.user.findUnique({
			where: { signaturaId: expectedSignaturaId },
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
				details: { signaturaId: expectedSignaturaId },
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
			nextPath: '/login/authorize',
			browserUserAgent: getUserAgent(req),
			clientId: 'accura',
			sourceApp: 'ACCURA',
			requesterOrigin: getOrigin(req),
			requestedAssuranceLevel: 'ZT-L2',
			returnUrl,
			expectedSignaturaId,
			rolePrefix,
			state,
			expiresInMs: ACCURA_AUTHORIZE_CHALLENGE_TTL_MS,
		});

		await logAuthAudit(req, 'accura_authorize_challenge_created', {
			userId: user.id,
			details: {
				challengeId: challenge.id,
				rolePrefix,
				expiresAt: challenge.expiresAt,
			},
		});

		const qrOrigin = assertPhoneReachableSignaturaOrigin(req);
		return Response.json({
			ok: true,
			challengeId: challenge.id,
			shortCode: challenge.shortCode,
			browserSecret,
			expiresAt: challenge.expiresAt,
			qrUrl: buildRemoteLoginQrUrl(qrOrigin, challenge.id, challenge.shortCode, {
				signaturaId: user.signaturaId,
			}),
			publicOrigin: qrOrigin,
			signaturaId: user.signaturaId,
			trustedDeviceCount: user.trustedDevices.length,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to start ACCURA authorization'),
			error.status ?? 400,
		);
	}
}
