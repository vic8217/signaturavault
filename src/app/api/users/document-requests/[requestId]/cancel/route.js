import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	cancelOwnerDocumentRequest,
	requireDocumentOwnerContext,
} from '@/lib/document-request-owner';

export async function POST(req, { params }) {
	try {
		const context = await requireDocumentOwnerContext();
		if (context.error) return context.error;

		const { requestId } = await params;
		const result = await cancelOwnerDocumentRequest({
			requestId,
			ownerUserId: context.session.userId,
			auditContext: {
				actorUserId: context.session.userId,
				ipAddress:
					req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
					req.headers.get('x-real-ip') ||
					null,
				device: req.headers.get('user-agent') || null,
			},
		});

		return Response.json(result);
	} catch (error) {
		const message = safeApiErrorMessage(error, 'Unable to cancel document request');
		const status = /not found/i.test(message) ? 404 : 400;
		return jsonError(message, status);
	}
}
