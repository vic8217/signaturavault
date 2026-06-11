import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	listOwnerDocumentCredentials,
	requireDocumentOwnerContext,
} from '@/lib/document-owner-credentials';

export async function GET() {
	try {
		const context = await requireDocumentOwnerContext();
		if (context.error) return context.error;

		const documents = await listOwnerDocumentCredentials(context.session.userId);
		return Response.json({ documents });
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to load document credentials'),
			400,
		);
	}
}
