import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	getOwnerDocumentRequestDetail,
	requireDocumentOwnerContext,
} from '@/lib/document-request-owner';

export async function GET(_req, { params }) {
	try {
		const context = await requireDocumentOwnerContext();
		if (context.error) return context.error;

		const requestId = String((await params)?.requestId || '').trim();
		if (!requestId) {
			return jsonError('requestId is required', 400);
		}

		const request = await getOwnerDocumentRequestDetail({
			requestId,
			ownerUserId: context.session.userId,
			role: context.role,
		});

		return Response.json({ request });
	} catch (error) {
		const message = safeApiErrorMessage(error, 'Unable to load document request');
		const status = /not found/i.test(message) ? 404 : 400;
		return jsonError(message, status);
	}
}
