import {
	auditAccuraSecurityEvent,
	normalizeAccuraAction,
	normalizeAccuraModule,
	verifyAccuraUnlockToken,
} from '@/lib/accuraAuthorization';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import {
	authenticateSignaturaClient,
	clientCredentials,
} from '@/lib/signaturaClientAuth';

function requestIp(req) {
	return (
		req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		req.headers.get('x-real-ip') ||
		null
	);
}

function expectedScope(body) {
	return {
		signaturaId: body.signaturaId,
		userId: body.userId,
		accuraUserId: body.accuraUserId || body.accura_user_id,
		companyCode: body.companyCode || body.company_code,
		companyId: body.companyId || body.company_id,
		tenantId: body.tenantId || body.tenant_id,
		module: body.module || body.accuraModule,
		action: body.action || body.accuraAction,
		resourceId: body.resourceId || body.resource_id,
		deviceId: body.deviceId || body.device_id,
		sessionId: body.sessionId || body.session_id,
	};
}

async function auditTokenResult({ payload, body, req, action, result, reason }) {
	if (!payload?.tenantId && !payload?.companyId && !payload?.companyCode) {
		return null;
	}
	return auditAccuraSecurityEvent({
		link: {
			userId: payload.userId,
			signaturaId: payload.signaturaId,
			companyCode: payload.companyCode,
			companyId: payload.companyId,
			tenantId: payload.tenantId,
			accuraUserId: payload.accuraUserId,
			sourceApp: 'ACCURA',
			rolePrefix: 'SADM',
			status: 'ACTIVE',
		},
		user: { id: payload.userId, signaturaId: payload.signaturaId },
		action,
		result,
		module: payload.module || body.module,
		accuraAction: payload.action || body.action,
		resourceId: payload.resourceId || body.resourceId,
		deviceId: payload.deviceId || body.deviceId,
		sessionId: payload.sessionId || body.sessionId,
		reason,
		ipAddress: requestIp(req),
	});
}

export async function POST(req) {
	try {
		const body = await req.json().catch(() => ({}));
		const authenticatedClient = await authenticateSignaturaClient({
			prisma,
			...clientCredentials(req, body),
		});
		if (!authenticatedClient) {
			return Response.json(
				{ valid: false, reason: 'invalid_client' },
				{ status: 401 },
			);
		}

		const token = String(body.unlockToken || body.token || '').trim();
		if (!token) {
			return Response.json(
				{ valid: false, reason: 'missing_unlock_token' },
				{ status: 400 },
			);
		}

		const expected = expectedScope(body);
		const verification = verifyAccuraUnlockToken(token, expected);
		const payload = verification.payload || null;
		if (!verification.valid) {
			await auditTokenResult({
				payload,
				body,
				req,
				action:
					verification.reason === 'expired'
						? 'ACCURA_UNLOCK_TOKEN_EXPIRED'
						: 'ACCURA_UNLOCK_TOKEN_DENIED',
				result: verification.reason === 'expired' ? 'failed' : 'denied',
				reason: verification.reason,
			});
			return Response.json(
				{ valid: false, reason: verification.reason },
				{ status: verification.reason === 'expired' ? 401 : 403 },
			);
		}

		await auditTokenResult({
			payload,
			body,
			req,
			action: 'ACCURA_UNLOCK_TOKEN_USED',
			result: 'succeeded',
		});

		return Response.json({
			valid: true,
			tokenType: 'ACCURA_UNLOCK',
			expiresAt: new Date(payload.exp * 1000),
			scope: {
				signaturaId: payload.signaturaId,
				userId: payload.userId,
				accuraUserId: payload.accuraUserId,
				companyCode: payload.companyCode,
				companyId: payload.companyId,
				tenantId: payload.tenantId,
				module: normalizeAccuraModule(payload.module),
				action: normalizeAccuraAction(payload.action),
				resourceId: payload.resourceId,
				deviceId: payload.deviceId,
				sessionId: payload.sessionId,
			},
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to verify ACCURA unlock token'),
			error.status ?? 400,
		);
	}
}
