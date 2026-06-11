import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	listOwnerDocumentRequests,
	requireDocumentOwnerContext,
	submitOwnerDocumentRequest,
} from '@/lib/document-request-owner';

function auditContextFromRequest(req, session) {
	return {
		ownerUserId: session.userId,
		ipAddress:
			req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
			req.headers.get('x-real-ip') ||
			null,
		device: req.headers.get('user-agent') || null,
	};
}

export async function GET() {
	try {
		const context = await requireDocumentOwnerContext();
		if (context.error) return context.error;

		const requests = await listOwnerDocumentRequests(context.session.userId);
		return Response.json({ requests });
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to load document requests'),
			400,
		);
	}
}

export async function POST(req) {
	try {
		const context = await requireDocumentOwnerContext();
		if (context.error) return context.error;

		const body = await req.json().catch(() => ({}));
		const result = await submitOwnerDocumentRequest(body, {
			...auditContextFromRequest(req, context.session),
			ownerUserId: context.session.userId,
		});

		return Response.json(result, { status: 201 });
	} catch (error) {
		const message = safeApiErrorMessage(error, 'Unable to submit document request');
		const status = /not found|not available/i.test(message) ? 404 : 400;
		return jsonError(message, status);
	}
}
