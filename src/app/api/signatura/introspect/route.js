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

async function authenticateClient({ clientId, clientSecret }) {
	if (!clientId || !clientSecret) return null;

	const envClientId =
		process.env.SIGNATURA_CLIENT_ID?.trim() || DEFAULT_ACCURA_CLIENT_ID;
	const envClientSecret = process.env.SIGNATURA_CLIENT_SECRET?.trim();
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

async function findChallenge(body) {
	const challengeId = requestedChallengeId(body);
	const expectedSignaturaId = requestedExpectedSignaturaId(body);
	if (challengeId) {
		const challenge = await prisma.trustedDeviceLoginChallenge.findUnique({
			where: { id: challengeId },
		});
		if (!challenge || !expectedSignaturaId) return challenge;
		const user = await prisma.user.findUnique({
			where: { id: challenge.userId },
			select: { signaturaId: true },
		});
		if (!user || user.signaturaId !== expectedSignaturaId) return null;
		return challenge;
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
		const authenticatedClient = await authenticateClient(
			clientCredentials(req, body),
		);
		if (!authenticatedClient) {
			return inactive('invalid_client', 401);
		}

		const challenge = await findChallenge(body);
		if (!challenge) return inactive('not_found', 404);
		if (
			challenge.clientId &&
			challenge.clientId !== authenticatedClient.clientId
		) {
			return inactive('not_found', 404);
		}
		if (
			challenge.sourceApp &&
			authenticatedClient.sourceApp &&
			challenge.sourceApp !== authenticatedClient.sourceApp
		) {
			return inactive('not_found', 404);
		}
		if (challenge.expiresAt <= new Date()) return inactive('expired');
		if (challenge.status !== LOGIN_CHALLENGE_STATUS.CONSUMED) {
			return inactive('not_found');
		}

		const user = await prisma.user.findUnique({
			where: { id: challenge.userId },
			select: { id: true, signaturaId: true },
		});
		if (!user) return inactive('not_found', 404);

		const trustedDevice = await prisma.trustedDevice.findFirst({
			where: {
				userId: challenge.userId,
				...(challenge.approvingDeviceId
					? { id: challenge.approvingDeviceId }
					: {}),
				...(challenge.approvingCredentialId
					? { credentialId: challenge.approvingCredentialId }
					: {}),
				isTrusted: true,
				removedAt: null,
				status: 'active',
			},
			select: { id: true },
		});
		if (!trustedDevice) {
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
			await auditAccuraSecurityEvent({
				link: appLink,
				user,
				action: 'ACCURA_LOGIN_FAILED',
				result: 'failed',
				reason: 'company_mismatch',
				deviceId: trustedDevice.id,
			});
			return inactive('company_mismatch', 200, { trustedDevice: true });
		}

		const accura = sanitizeAccuraAppMetadata(appLink);
		if (sourceApp === 'ACCURA') {
			await auditAccuraSecurityEvent({
				link: appLink,
				user,
				action: 'ACCURA_LOGIN_APPROVED',
				result: 'succeeded',
				deviceId: trustedDevice.id,
			});
		}

		return Response.json({
			active: true,
			subject: user.id,
			signaturaId: user.signaturaId,
			rolePrefix: challenge.rolePrefix || appLink?.rolePrefix || null,
			companyCode: appLink?.companyCode || null,
			companyId: appLink?.companyId || null,
			tenantId: appLink?.tenantId || appLink?.companyId || null,
			accuraUserId: appLink?.accuraUserId || null,
			identityVerified: true,
			trustedDevice: true,
			keyUnlocked: true,
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
