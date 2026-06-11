import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	getDocumentRequestFormSchema,
	requireDocumentOwnerContext,
} from '@/lib/document-request-lookup';

export async function GET(_req, { params }) {
	try {
		const context = await requireDocumentOwnerContext();
		if (context.error) return context.error;

		const { issuerId, documentType } = await params;
		const schema = await getDocumentRequestFormSchema(issuerId, documentType);

		return Response.json(schema);
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to load document request form schema'),
			404,
		);
	}
}
