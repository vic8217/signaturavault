import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	listPublicRequestIssuers,
	requireDocumentOwnerContext,
} from '@/lib/document-request-lookup';

export async function GET() {
	try {
		const context = await requireDocumentOwnerContext();
		if (context.error) return context.error;

		const issuers = await listPublicRequestIssuers();
		return Response.json({ issuers });
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to load requestable issuers'),
			400,
		);
	}
}
