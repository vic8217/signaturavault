import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { verifyPublicDocumentByToken } from '@/lib/document-records';

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ token: string }> },
) {
	try {
		const { token } = await params;
		if (!token) return jsonError('Verification token is required');

		const result = await verifyPublicDocumentByToken(token);
		if (result.error) {
			return jsonError(result.error, result.status || 404);
		}

		return Response.json(result.body);
	} catch (error) {
		return jsonError(safeApiErrorMessage(error, 'Unable to verify token'), 400);
	}
}
