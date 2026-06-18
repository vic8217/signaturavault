import crypto from 'crypto';
import {
	auditAccuraSecurityEvent,
	sanitizeAccuraAppMetadata,
} from '@/lib/accuraAuthorization';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { normalizeSignaturaId } from '@/lib/identity';
import { prisma } from '@/lib/prisma';
import { LOGIN_CHALLENGE_STATUS } from '@/lib/trustedDeviceLoginChallenge';

const DEFAULT_ACCURA_CLIENT_ID = 'accura';

function inactive(reason, status = 200, extra = {}) {
	return Response.json({ active: false, reason, ...extra }, { status });
}

function timingSafeEqualString(left, right) {
	const leftBuffer = Buffer.from(String(left || ''));
	const rightBuffer = Buffer.from(String(right || ''));
	return (
		leftBuffer.length === rightBuffer.length &&
		crypto.timingSafeEqual(leftBuffer, rightBuffer)
	);
}

function basicCredentials(req) {
	const auth = req.headers.get('authorization') || '';
	const match = auth.match(/^Basic\s+(.+)$/i);
	if (!match) return {};
	try {
		const decoded = Buffer.from(match[1], 'base64').toString('utf8');
		const separator = decoded.indexOf(':');
		if (separator === -1) return {};
		return {
			clientId: decoded.slice(0, separator),
			clientSecret: decoded.slice(separator + 1),
		};
	} catch {
		return {};
	}
}

function clientCredentials(req, body) {
	const basic = basicCredentials(req);
	return {
		clientId:
			String(
				basic.clientId ||
					req.headers.get('x-signatura-client-id') ||
					body.clientId ||
					'',
			).trim() || null,
		clientSecret:
			String(
				basic.clientSecret ||
					req.headers.get('x-signatura-client-secret') ||
					body.clientSecret ||
					'',
			).trim() || null,
	};
}

function resolvedAccuraClientSecret() {
	return (
		process.env.SIGNATURA_CLIENT_SECRET?.trim() ||
		process.env.ACCURA_CLIENT_SECRET?.trim() ||
		null
	);
}

async function authenticateClient({ clientId, clientSecret }) {
	if (!clientId || !clientSecret) return null;

	const envClientId =
		process.env.SIGNATURA_CLIENT_ID?.trim() ||
		process.env.ACCURA_CLIENT_ID?.trim() ||
		DEFAULT_ACCURA_CLIENT_ID;
	const envClientSecret = resolvedAccuraClientSecret();
	if (
		envClientSecret &&
		timingSafeEqualString(clientId, envClientId) &&
		timingSafeEqualString(clientSecret, envClientSecret)
	) {
		return { clientId: envClientId, sourceApp: 'ACCURA' };
	}

	const client = await prisma.apiClient.findFirst({
		where: {
			clientId,
			status: 'active',
		},
	});
	if (
		client?.clientSecret &&
		timingSafeEqualString(clientSecret, client.clientSecret)
	) {
		return {
			clientId: client.clientId,
			sourceApp:
				client.clientId.toLowerCase() === DEFAULT_ACCURA_CLIENT_ID
					? 'ACCURA'
					: client.name?.toUpperCase() || null,
		};
	}

	return null;
}

function requestedChallengeId(body) {
	return String(
		body.challengeId ||
			body.cid ||
			body.assertion ||
			body.signaturaAssertion ||
			body.signatura_assertion ||
			'',
	).trim();
}

function requestedExpectedSignaturaId(body) {
	return normalizeSignaturaId(
		body.expectedSignaturaId || body.expected_signatura_id || '',
	);
}

function requestedLookupSignaturaId(body) {
	return normalizeSignaturaId(body.signaturaId);
}

function isAccuraClient(client) {
	return client?.clientId?.toLowerCase() === DEFAULT_ACCURA_CLIENT_ID;
}

async function auditIntrospection({
	challenge,
	user,
	link,
	clientId,
	sourceApp,
	requestedChallengeId,
	result,
	reason,
	deviceId,
	sessionId,
} = {}) {
	await prisma.securityEventLog.create({
		data: {
			id: crypto.randomUUID(),
			userId: user?.id || challenge?.userId || null,
			event: 'signatura_introspection',
			details: {
				clientId: challenge?.clientId || clientId || null,
				sourceApp: challenge?.sourceApp || sourceApp || null,
				challengeId: challenge?.id || requestedChallengeId || null,
				result,
				reason: reason || null,
				deviceId: deviceId || null,
				sessionId: sessionId || null,
			},
		},
	});
	if (link || user) {
		await auditAccuraSecurityEvent({
			link,
			user,
			action:
				result === 'succeeded'
					? 'ACCURA_LOGIN_APPROVED'
					: 'ACCURA_LOGIN_FAILED',
			result,
			reason,
			deviceId,
			sessionId,
		});
	}
}

async function findChallenge(body) {
	const challengeId = requestedChallengeId(body);
	if (challengeId) {
		return prisma.trustedDeviceLoginChallenge.findUnique({
			where: { id: challengeId },
		});
	}

	const signaturaId = requestedLookupSignaturaId(body);
	if (!signaturaId) return null;
	const user = await prisma.user.findUnique({
		where: { signaturaId },
		select: { id: true },
	});
	if (!user) return null;

	return prisma.trustedDeviceLoginChallenge.findFirst({
		where: {
			userId: user.id,
			status: LOGIN_CHALLENGE_STATUS.CONSUMED,
		},
		orderBy: { consumedAt: 'desc' },
	});
}

export async function POST(req) {
	try {
		const body = await req.json().catch(() => ({}));
		const credentials = clientCredentials(req, body);
		const authenticatedClient = await authenticateClient(credentials);
		if (!authenticatedClient) {
			await auditIntrospection({
				clientId: credentials.clientId,
				requestedChallengeId: requestedChallengeId(body),
				result: 'failed',
				reason: 'invalid_client',
			});
			return inactive('invalid_client', 401);
		}

		const challengeId = requestedChallengeId(body);
		const expectedSignaturaId = requestedExpectedSignaturaId(body);
		if (isAccuraClient(authenticatedClient) && !challengeId) {
			await auditIntrospection({
				clientId: authenticatedClient.clientId,
				sourceApp: authenticatedClient.sourceApp,
				result: 'failed',
				reason: 'challenge_required',
			});
			return inactive('challenge_required');
		}
		if (isAccuraClient(authenticatedClient) && !expectedSignaturaId) {
			await auditIntrospection({
				clientId: authenticatedClient.clientId,
				sourceApp: authenticatedClient.sourceApp,
				requestedChallengeId: challengeId,
				result: 'failed',
				reason: 'expected_signatura_id_required',
			});
			return inactive('expected_signatura_id_required');
		}

		const challenge = await findChallenge(body);
		if (!challenge) {
			await auditIntrospection({
				clientId: authenticatedClient.clientId,
				sourceApp: authenticatedClient.sourceApp,
				requestedChallengeId: challengeId,
				result: 'failed',
				reason: 'not_found',
			});
			return inactive('not_found', 404);
		}
		if (challenge.clientId !== authenticatedClient.clientId) {
			await auditIntrospection({
				challenge,
				result: 'failed',
				reason: 'client_mismatch',
			});
			return inactive('not_found', 404);
		}
		if (challenge.sourceApp !== authenticatedClient.sourceApp) {
			await auditIntrospection({
				challenge,
				result: 'failed',
				reason: 'source_mismatch',
			});
			return inactive('not_found', 404);
		}
		if (isAccuraClient(authenticatedClient) && challenge.clientId !== 'accura') {
			await auditIntrospection({
				challenge,
				result: 'failed',
				reason: 'client_mismatch',
			});
			return inactive('not_found', 404);
		}
		if (isAccuraClient(authenticatedClient) && challenge.sourceApp !== 'ACCURA') {
			await auditIntrospection({
				challenge,
				result: 'failed',
				reason: 'source_mismatch',
			});
			return inactive('not_found', 404);
		}
		if (challenge.expiresAt <= new Date()) {
			await auditIntrospection({
				challenge,
				result: 'failed',
				reason: 'expired',
			});
			return inactive('expired');
		}
		if (challenge.consumedAt || challenge.status === LOGIN_CHALLENGE_STATUS.CONSUMED) {
			await auditIntrospection({
				challenge,
				result: 'failed',
				reason: 'already_consumed',
			});
			return inactive('already_consumed');
		}
		if (challenge.status !== LOGIN_CHALLENGE_STATUS.APPROVED) {
			await auditIntrospection({
				challenge,
				result: 'failed',
				reason: 'not_verified',
			});
			return inactive('not_verified');
		}
		if (!challenge.approvingDeviceId || !challenge.approvingCredentialId) {
			await auditIntrospection({
				challenge,
				result: 'failed',
				reason: 'not_verified',
			});
			return inactive('not_verified');
		}

		const user = await prisma.user.findUnique({
			where: { id: challenge.userId },
			select: { id: true, signaturaId: true, accountStatus: true },
		});
		if (!user) {
			await auditIntrospection({
				challenge,
				result: 'failed',
				reason: 'not_found',
			});
			return inactive('not_found', 404);
		}
		if (
			challenge.expectedSignaturaId &&
			challenge.expectedSignaturaId !== expectedSignaturaId
		) {
			await auditIntrospection({
				challenge,
				user,
				result: 'failed',
				reason: 'signatura_id_mismatch',
			});
			return inactive('signatura_id_mismatch');
		}
		if (user.signaturaId !== expectedSignaturaId) {
			await auditIntrospection({
				challenge,
				user,
				result: 'failed',
				reason: 'signatura_id_mismatch',
			});
			return inactive('signatura_id_mismatch');
		}
		if (user.accountStatus !== 'active') {
			await auditIntrospection({
				challenge,
				user,
				result: 'failed',
				reason: 'account_inactive',
			});
			return inactive('account_inactive');
		}

		const trustedDevice = await prisma.trustedDevice.findFirst({
			where: {
				userId: challenge.userId,
				id: challenge.approvingDeviceId,
				credentialId: challenge.approvingCredentialId,
				isTrusted: true,
				removedAt: null,
				status: 'active',
			},
			select: { id: true },
		});
		if (!trustedDevice) {
			await auditIntrospection({
				challenge,
				user,
				result: 'failed',
				reason: 'untrusted_device',
			});
			return inactive('untrusted_device', 200, { trustedDevice: false });
		}

		const sourceApp = challenge.sourceApp || authenticatedClient.sourceApp;
		const appLink = await prisma.signaturaAppLink.findFirst({
			where: {
				userId: challenge.userId,
				...(sourceApp ? { sourceApp } : {}),
				...(challenge.rolePrefix ? { rolePrefix: challenge.rolePrefix } : {}),
				status: 'ACTIVE',
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
		if (sourceApp === 'ACCURA' && !appLink) {
			await auditIntrospection({
				challenge,
				user,
				result: 'failed',
				reason: 'accura_link_not_found',
				deviceId: trustedDevice.id,
			});
			return inactive('accura_link_not_found', 200, { trustedDevice: true });
		}

		const requestedCompanyCode = String(
			body.companyCode || body.company_code || '',
		).trim();
		if (
			requestedCompanyCode &&
			appLink?.companyCode &&
			appLink.companyCode !== requestedCompanyCode
		) {
			await auditIntrospection({
				challenge,
				user,
				link: appLink,
				result: 'failed',
				reason: 'company_mismatch',
				deviceId: trustedDevice.id,
			});
			return inactive('company_mismatch', 200, { trustedDevice: true });
		}

		const accura = sanitizeAccuraAppMetadata(appLink);
		const redeemResult = await prisma.trustedDeviceLoginChallenge.updateMany({
			where: {
				id: challenge.id,
				status: LOGIN_CHALLENGE_STATUS.APPROVED,
				consumedAt: null,
				expiresAt: { gt: new Date() },
			},
			data: {
				status: LOGIN_CHALLENGE_STATUS.CONSUMED,
				consumedAt: new Date(),
			},
		});
		if (redeemResult.count !== 1) {
			await auditIntrospection({
				challenge,
				user,
				link: appLink,
				result: 'failed',
				reason: 'already_consumed',
				deviceId: trustedDevice.id,
			});
			return inactive('already_consumed');
		}
		if (sourceApp === 'ACCURA') {
			await auditIntrospection({
				challenge,
				link: appLink,
				user,
				result: 'succeeded',
				deviceId: trustedDevice.id,
			});
		}

		return Response.json({
			active: true,
			subject: user.id,
			signaturaId: user.signaturaId,
			rolePrefix: challenge.rolePrefix || appLink?.rolePrefix || null,
			sessionType: 'trusted-device',
			sessionId: null,
			companyCode: appLink?.companyCode || null,
			companyId: appLink?.companyId || null,
			tenantId: appLink?.tenantId || appLink?.companyId || null,
			accuraUserId: appLink?.accuraUserId || null,
			identityVerified: true,
			trustedDevice: true,
			keyUnlocked: false,
			assuranceLevel: challenge.requestedAssuranceLevel || 'ZT-L2',
			clientId: challenge.clientId || authenticatedClient.clientId,
			sourceApp,
			requesterOrigin: challenge.requesterOrigin || null,
			expiresAt: challenge.expiresAt,
			accura,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to introspect Signatura assurance'),
			error.status ?? 400,
		);
	}
}
