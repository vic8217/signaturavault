import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	auditContextFromActor,
	denyIssuerDocumentRequest,
	requireIssuerRequestContext,
} from '@/lib/document-request-issuer';

function auditContextFromRequest(req, context) {
	return auditContextFromActor(context, {
		ipAddress:
			req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
			req.headers.get('x-real-ip') ||
			null,
		device: req.headers.get('user-agent') || null,
	});
}

export async function POST(req, { params }) {
	try {
		const context = await requireIssuerRequestContext();
		if (context.error) return context.error;

		const requestId = String((await params)?.requestId || '').trim();
		if (!requestId) {
			return jsonError('requestId is required', 400);
		}

		const body = await req.json().catch(() => ({}));
		const result = await denyIssuerDocumentRequest({
			requestId,
			tenantId: context.tenantId,
			actorUserId: context.session.userId,
			denialReason: body.denialReason,
			auditContext: auditContextFromRequest(req, context),
		});

		return Response.json(result);
	} catch (error) {
		const message = safeApiErrorMessage(error, 'Unable to deny document request');
		const status = /not found/i.test(message) ? 404 : 400;
		return jsonError(message, status);
	}
}
