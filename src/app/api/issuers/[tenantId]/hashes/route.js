import { authenticateApiRequest } from '@/lib/auth';
import { updateDocumentRecordHash } from '@/lib/document-records';

export async function POST(req, { params }) {
	const { tenantId } = await params;
	const auth = await authenticateApiRequest(req, tenantId);
	if (!auth) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
		});
	}

	const payload = await req.json();
	const { documentId, documentHash } = payload;

	if (!documentId || !documentHash) {
		return new Response(
			JSON.stringify({ error: 'documentId and documentHash are required' }),
			{ status: 400 },
		);
	}

	try {
		const result = await updateDocumentRecordHash({
			tenantId,
			documentId,
			documentHash,
			auditContext: {
				apiClientId: auth.client.id,
				path: `/api/issuers/${tenantId}/hashes`,
				method: 'POST',
			},
		});

		if (result.error) {
			return new Response(JSON.stringify({ error: result.error }), {
				status: result.status || 400,
			});
		}

		return new Response(JSON.stringify(result.body), {
			status: result.status || 200,
		});
	} catch (error) {
		return new Response(
			JSON.stringify({ error: error.message || 'Unable to submit hash' }),
			{ status: 400 },
		);
	}
}
