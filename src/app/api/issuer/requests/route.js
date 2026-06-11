import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	listIssuerDocumentRequests,
	requireIssuerRequestContext,
} from '@/lib/document-request-issuer';

export async function GET(req) {
	try {
		const context = await requireIssuerRequestContext();
		if (context.error) return context.error;

		const { searchParams } = new URL(req.url);
		const status = String(searchParams.get('status') || '').trim() || undefined;

		const requests = await listIssuerDocumentRequests(context.tenantId, { status });
		return Response.json({ requests });
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to load issuer document requests'),
			400,
		);
	}
}
