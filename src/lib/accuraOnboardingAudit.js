import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { auditEvent } from '@/lib/audit';
import { getUserAgent } from '@/lib/webauthn';

const ACCURA_ONBOARDING_ACTIONS = Object.freeze({
	REQUEST_RECEIVED: 'ACCURA_REGISTRATION_REQUEST_RECEIVED',
	REQUEST_FAILED: 'ACCURA_REGISTRATION_REQUEST_FAILED',
	ID_CREATED: 'ACCURA_SIGNATURA_ID_CREATED',
	ID_LINKED: 'ACCURA_SIGNATURA_ID_LINKED',
	REDIRECT_ISSUED: 'ACCURA_REGISTRATION_REDIRECT_ISSUED',
});

function tenantIdFromContext(context = {}) {
	return (
		context.companyId ||
		context.accuraCompanyId ||
		context.companyCode ||
		context.accuraCompanyCode ||
		'accura-onboarding'
	);
}

function baseDetails(context = {}, extra = {}) {
	return {
		sourceApp: 'ACCURA',
		clientId: context.clientId || 'accura',
		companyId: context.companyId || context.accuraCompanyId || null,
		companyCode: context.companyCode || context.accuraCompanyCode || null,
		rolePrefix: context.roleCode || context.rolePrefix || context.accuraRoleCode || null,
		registrationKeyId:
			context.registrationKeyId || context.accuraRegistrationKeyId || null,
		requestId: context.requestId || context.jti || context.tokenId || null,
		state: context.state || null,
		nonce: context.nonce || null,
		mode: context.mode || 'create',
		...extra,
	};
}

async function logAccuraOnboardingSecurityEvent(req, event, userId, details = {}) {
	await prisma.securityEventLog.create({
		data: {
			id: crypto.randomUUID(),
			userId: userId || null,
			event,
			userAgent: req ? getUserAgent(req) : null,
			details,
		},
	});
}

async function auditAccuraOnboardingEvent({
	req,
	action,
	result = 'succeeded',
	userId = null,
	context = {},
	details = {},
}) {
	const payload = baseDetails(context, details);
	await logAccuraOnboardingSecurityEvent(req, action, userId, payload);
	return auditEvent({
		tenantId: tenantIdFromContext(context),
		userId,
		action,
		result,
		details: payload,
	});
}

export {
	ACCURA_ONBOARDING_ACTIONS,
	auditAccuraOnboardingEvent,
	logAccuraOnboardingSecurityEvent,
};
