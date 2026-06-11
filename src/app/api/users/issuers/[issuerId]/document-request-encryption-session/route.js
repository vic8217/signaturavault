import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { createDocumentRequestEncryptionSession } from '@/lib/document-request-encryption-session';
import { requireDocumentOwnerContext } from '@/lib/document-request-lookup';

export async function POST(req, { params }) {
	try {
		const context = await requireDocumentOwnerContext();
		if (context.error) return context.error;

		const { issuerId } = await params;
		const session = await createDocumentRequestEncryptionSession({
			issuerId,
			ownerUserId: context.session.userId,
			session: context.session,
			auditContext: {
				ipAddress:
					req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
					req.headers.get('x-real-ip') ||
					null,
				device: req.headers.get('user-agent') || null,
			},
		});

		return Response.json(session);
	} catch (error) {
		const message = safeApiErrorMessage(
			error,
			'Unable to prepare secure document request encryption',
		);
		const status = /not found|not available|not ready/i.test(message) ? 404 : 403;
		return jsonError(message, status);
	}
}
