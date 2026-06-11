import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	listIssuerDocumentTypes,
	requireDocumentOwnerContext,
} from '@/lib/document-request-lookup';

export async function GET(_req, { params }) {
	try {
		const context = await requireDocumentOwnerContext();
		if (context.error) return context.error;

		const { issuerId } = await params;
		const documentTypes = await listIssuerDocumentTypes(issuerId);

		return Response.json({
			issuerId,
			documentTypes,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to load issuer document types'),
			404,
		);
	}
}
