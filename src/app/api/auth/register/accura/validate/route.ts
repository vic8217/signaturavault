import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/api';
import {
	ACCURA_ONBOARDING_ACTIONS,
	auditAccuraOnboardingEvent,
} from '@/lib/accuraOnboardingAudit';
import {
	accuraRegistrationContextForForm,
	verifyAccuraRegistrationHandoffToken,
} from '@/lib/accuraRegistrationHandoff';
import {
	authenticateSignaturaClient,
	clientCredentials,
} from '@/lib/signaturaClientAuth';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
	const body = await req.json().catch(() => ({}));
	const credentials = clientCredentials(req, body);
	const client = await authenticateSignaturaClient({
		prisma,
		clientId: credentials.clientId,
		clientSecret: credentials.clientSecret,
	});
	if (!client || client.sourceApp !== 'ACCURA') {
		return jsonError('Unauthorized ACCURA client', 401);
	}

	const handoffToken = String(body.handoffToken || body.accuraHandoffToken || '').trim();
	if (!handoffToken) {
		return jsonError('handoffToken is required', 400);
	}

	const verified = verifyAccuraRegistrationHandoffToken(handoffToken);
	if (!verified.valid || !verified.context) {
		await auditAccuraOnboardingEvent({
			req,
			action: ACCURA_ONBOARDING_ACTIONS.REQUEST_FAILED,
			result: 'failed',
			context: verified.context || {},
			details: {
				reason: verified.reason || verified.error || 'invalid_handoff',
				clientId: credentials.clientId,
			},
		});
		return jsonError(
			verified.error || 'Invalid or expired ACCURA onboarding request',
			400,
		);
	}

	await auditAccuraOnboardingEvent({
		req,
		action: ACCURA_ONBOARDING_ACTIONS.REQUEST_RECEIVED,
		context: verified.context,
		details: { clientId: credentials.clientId },
	});

	return NextResponse.json({
		ok: true,
		context: accuraRegistrationContextForForm(verified.context),
	});
}
