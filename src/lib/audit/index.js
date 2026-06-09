import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { redactForLog } from '@/lib/security';

function resultForAction(action) {
	if (String(action || '').includes('DENIED')) return 'denied';
	if (String(action || '').includes('FAILED')) return 'failed';
	return 'succeeded';
}

async function auditEvent({
	tenantId,
	issuerId = null,
	userId = null,
	action,
	target = null,
	details = {},
	result,
	ipAddress = null,
	device = null,
}) {
	if (!tenantId || !action) return null;
	const redactedDetails = redactForLog(details);
	const normalizedResult = result || resultForAction(action);

	const auditLog = await prisma.auditLog.create({
		data: {
			id: crypto.randomUUID(),
			tenantId,
			issuerId,
			userId,
			action,
			target,
			details: redactedDetails,
		},
	});

	await prisma.securityAuditLog.create({
		data: {
			tenantId,
			userId,
			action,
			result: normalizedResult,
			ipAddress,
			device,
			details: redactedDetails,
		},
	});

	return auditLog;
}

export { auditEvent };
