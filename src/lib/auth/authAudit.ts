import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { getUserAgent } from '@/lib/webauthn';

const AUTH_TENANT_ID = 'signatura-auth';

const SENSITIVE_DETAIL_KEYS = new Set([
	'recoveryPhrase',
	'recoveryCode',
	'browserSecret',
	'approvalToken',
	'registrationToken',
	'fullName',
	'handphone',
	'email',
]);

function getIpAddress(req: Request) {
	return (
		req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		req.headers.get('x-real-ip') ||
		null
	);
}

function redactDetails(details: Record<string, unknown> = {}) {
	const redacted: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(details)) {
		if (SENSITIVE_DETAIL_KEYS.has(key)) continue;
		redacted[key] = value;
	}
	return redacted;
}

export async function logAuthAudit(
	req: Request,
	action: string,
	{
		userId = null,
		result = 'success',
		details = {},
	}: {
		userId?: string | null;
		result?: 'success' | 'denied' | 'failed';
		details?: Record<string, unknown>;
	} = {},
) {
	const ipAddress = getIpAddress(req);
	const userAgent = getUserAgent(req);
	const safeDetails = redactDetails(details);

	await prisma.$transaction([
		prisma.securityEventLog.create({
			data: {
				id: crypto.randomUUID(),
				userId,
				event: action,
				ipAddress,
				userAgent,
				details: safeDetails,
			},
		}),
		prisma.securityAuditLog.create({
			data: {
				userId,
				tenantId: AUTH_TENANT_ID,
				action,
				result,
				ipAddress,
				device: userAgent.slice(0, 120) || null,
				details: safeDetails,
			},
		}),
	]);
}

export { AUTH_TENANT_ID };
