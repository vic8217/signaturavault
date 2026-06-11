import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	getIssuerDocumentRequestDetail,
	requireIssuerRequestContext,
} from '@/lib/document-request-issuer';

export async function GET(_req, { params }) {
	try {
		const context = await requireIssuerRequestContext();
		if (context.error) return context.error;

		const requestId = String((await params)?.requestId || '').trim();
		if (!requestId) {
			return jsonError('requestId is required', 400);
		}

		const request = await getIssuerDocumentRequestDetail({
			requestId,
			tenantId: context.tenantId,
			role: context.role,
		});

		return Response.json({ request });
	} catch (error) {
		const message = safeApiErrorMessage(error, 'Unable to load document request');
		const status = /not found/i.test(message) ? 404 : 400;
		return jsonError(message, status);
	}
}
