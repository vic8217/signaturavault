import {
	ACCURA_SOURCE_APP,
	accuraMetadataAllowsAction,
	auditAccuraSecurityEvent,
	isCriticalAccuraAction,
	issueAccuraUnlockToken,
	moduleForAccuraAction,
	normalizeAccuraAction,
	normalizeAccuraModule,
	sanitizeAccuraAppMetadata,
} from '@/lib/accuraAuthorization';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { normalizeSignaturaId } from '@/lib/identity';
import { prisma } from '@/lib/prisma';
import {
	authenticateSignaturaClient,
	clientCredentials,
} from '@/lib/signaturaClientAuth';
import { LOGIN_CHALLENGE_STATUS } from '@/lib/trustedDeviceLoginChallenge';

function requestIp(req) {
	return (
		req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		req.headers.get('x-real-ip') ||
		null
	);
}

function jsonDenied(reason, status = 403) {
	return Response.json({ ok: false, approved: false, reason }, { status });
}

function requestedActionContext(body) {
	const action = normalizeAccuraAction(body.action || body.accuraAction);
	const module = normalizeAccuraModule(
		body.module || body.accuraModule || moduleForAccuraAction(action),
	);
	return {
		module,
		action,
		resourceId: String(body.resourceId || body.resource_id || '').trim() || null,
		sessionId: String(body.sessionId || body.session_id || '').trim() || null,
		deviceId: String(body.deviceId || body.device_id || '').trim() || null,
	};
}

async function findApprovalChallenge(body, authenticatedClient) {
	const challengeId = String(
		body.challengeId ||
			body.cid ||
			body.assertion ||
			body.signaturaAssertion ||
			body.signatura_assertion ||
			'',
	).trim();
	if (!challengeId) return null;

	const challenge = await prisma.trustedDeviceLoginChallenge.findUnique({
		where: { id: challengeId },
	});
	if (!challenge) return null;
	if (challenge.clientId && challenge.clientId !== authenticatedClient.clientId) {
		return null;
	}
	if (
		challenge.sourceApp &&
		authenticatedClient.sourceApp &&
		challenge.sourceApp !== authenticatedClient.sourceApp
	) {
		return null;
	}
	if (challenge.status !== LOGIN_CHALLENGE_STATUS.CONSUMED) return null;
	if (challenge.expiresAt <= new Date()) return null;
	return challenge;
}

function matchesRequestedTenant(link, body) {
	const metadata = sanitizeAccuraAppMetadata(link);
	const expected = {
		companyCode: String(body.companyCode || body.company_code || '').trim(),
		companyId: String(body.companyId || body.company_id || '').trim(),
		tenantId: String(body.tenantId || body.tenant_id || '').trim(),
		accuraUserId: String(body.accuraUserId || body.accura_user_id || '').trim(),
	};
	return Object.entries(expected).every(([field, value]) => {
		if (!value) return true;
		return String(metadata[field] || '') === value;
	});
}

async function findAccuraLink({ userId, rolePrefix, body }) {
	const links = await prisma.signaturaAppLink.findMany({
		where: {
			userId,
			sourceApp: ACCURA_SOURCE_APP,
			status: 'ACTIVE',
			...(rolePrefix ? { rolePrefix } : {}),
		},
		orderBy: { createdAt: 'desc' },
		select: {
			id: true,
			userId: true,
			signaturaId: true,
			sourceApp: true,
			companyCode: true,
			companyId: true,
			tenantId: true,
			accuraUserId: true,
			role: true,
			rolePrefix: true,
			moduleAccess: true,
			permissionSet: true,
			registrationContext: true,
			trustedDeviceStatus: true,
			status: true,
		},
	});
	return links.find((link) => matchesRequestedTenant(link, body)) || null;
}

export async function POST(req) {
	let body = {};
	try {
		body = await req.json().catch(() => ({}));
		const authenticatedClient = await authenticateSignaturaClient({
			prisma,
			...clientCredentials(req, body),
		});
		if (!authenticatedClient) return jsonDenied('invalid_client', 401);

		const context = requestedActionContext(body);
		if (!context.action || !context.module) {
			return jsonDenied('missing_action_context', 400);
		}
		if (!context.sessionId || !context.deviceId) {
			return jsonDenied('missing_session_or_device_scope', 400);
		}

		const challenge = await findApprovalChallenge(body, authenticatedClient);
		if (!challenge) return jsonDenied('approval_challenge_required', 403);

		const user = await prisma.user.findUnique({
			where: { id: challenge.userId },
			select: { id: true, signaturaId: true, accountStatus: true, trustLevel: true },
		});
		const requestedSignaturaId = normalizeSignaturaId(body.signaturaId);
		if (!user || user.accountStatus !== 'active') {
			return jsonDenied('identity_not_active', 403);
		}
		if (requestedSignaturaId && user.signaturaId !== requestedSignaturaId) {
			return jsonDenied('signatura_id_mismatch', 403);
		}
		if (user.trustLevel < 2) return jsonDenied('insufficient_trust_level', 403);

		const trustedDevice = await prisma.trustedDevice.findFirst({
			where: {
				userId: user.id,
				...(challenge.approvingDeviceId ? { id: challenge.approvingDeviceId } : {}),
				...(challenge.approvingCredentialId
					? { credentialId: challenge.approvingCredentialId }
					: {}),
				isTrusted: true,
				removedAt: null,
				status: 'active',
			},
			select: { id: true },
		});
		if (!trustedDevice) return jsonDenied('untrusted_device', 403);

		const link = await findAccuraLink({
			userId: user.id,
			rolePrefix: challenge.rolePrefix,
			body,
		});
		if (!link) return jsonDenied('accura_link_not_found', 403);
		if (!accuraMetadataAllowsAction(link, context)) {
			await auditAccuraSecurityEvent({
				link,
				user,
				action: 'ACCURA_SENSITIVE_ACTION_DENIED',
				result: 'denied',
				module: context.module,
				accuraAction: context.action,
				resourceId: context.resourceId,
				deviceId: context.deviceId,
				sessionId: context.sessionId,
				reason: 'metadata_or_policy_denied',
				ipAddress: requestIp(req),
			});
			return jsonDenied('action_not_allowed', 403);
		}

		const metadata = sanitizeAccuraAppMetadata(link);
		const issued = issueAccuraUnlockToken({
			signaturaId: user.signaturaId,
			userId: user.id,
			accuraUserId: metadata.accuraUserId,
			companyCode: metadata.companyCode,
			companyId: metadata.companyId,
			tenantId: metadata.tenantId,
			module: context.module,
			action: context.action,
			resourceId: context.resourceId,
			deviceId: context.deviceId,
			sessionId: context.sessionId,
			clientId: authenticatedClient.clientId,
			challengeId: challenge.id,
			ttlSeconds: body.ttlSeconds,
		});

		await auditAccuraSecurityEvent({
			link,
			user,
			action: 'ACCURA_SENSITIVE_ACTION_APPROVED',
			result: 'succeeded',
			module: context.module,
			accuraAction: context.action,
			resourceId: context.resourceId,
			deviceId: context.deviceId,
			sessionId: context.sessionId,
			ipAddress: requestIp(req),
		});
		await auditAccuraSecurityEvent({
			link,
			user,
			action: 'ACCURA_UNLOCK_TOKEN_ISSUED',
			result: 'succeeded',
			module: context.module,
			accuraAction: context.action,
			resourceId: context.resourceId,
			deviceId: context.deviceId,
			sessionId: context.sessionId,
			ipAddress: requestIp(req),
		});

		return Response.json({
			ok: true,
			approved: true,
			unlockToken: issued.token,
			tokenType: 'ACCURA_UNLOCK',
			expiresAt: issued.expiresAt,
			scope: {
				signaturaId: user.signaturaId,
				userId: user.id,
				accuraUserId: metadata.accuraUserId,
				companyCode: metadata.companyCode,
				companyId: metadata.companyId,
				tenantId: metadata.tenantId,
				module: context.module,
				action: context.action,
				resourceId: context.resourceId,
				deviceId: context.deviceId,
				sessionId: context.sessionId,
			},
			freshApprovalRequired: isCriticalAccuraAction(context.action),
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to approve ACCURA action'),
			error.status ?? 400,
		);
	}
}
