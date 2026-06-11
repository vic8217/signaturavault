import { authenticateApiRequest } from '@/lib/auth';
import { generateId, loadDb, now, saveDb } from '@/lib/db';
import { verifyTenantDocumentRecord } from '@/lib/document-records';
import { safeApiLogEntry } from '@/lib/security';

async function handleVerification(req, tenantId) {
	const token = new URL(req.url).searchParams.get('token');

	if (!token) {
		return new Response(JSON.stringify({ error: 'token is required' }), {
			status: 400,
		});
	}

	const result = await verifyTenantDocumentRecord({ tenantId, token });
	if (result.error) {
		return new Response(JSON.stringify({ error: result.error }), {
			status: result.status || 404,
		});
	}

	return new Response(JSON.stringify(result.body), {
		status: result.status || 200,
	});
}

export async function GET(req, { params }) {
	const { tenantId } = await params;
	return handleVerification(req, tenantId);
}

export async function POST(req, { params }) {
	const { tenantId } = await params;
	const auth = await authenticateApiRequest(req, tenantId);
	if (!auth) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
		});
	}

	const token = new URL(req.url).searchParams.get('token');
	const result = await verifyTenantDocumentRecord({ tenantId, token });
	if (result.error) {
		return new Response(JSON.stringify({ error: result.error }), {
			status: result.status || 404,
		});
	}

	// API audit log remains JSON-backed for now; verification read path is Prisma-first.
	const db = await loadDb();
	db.api_logs.push(
		safeApiLogEntry({
			id: generateId('apilog'),
			tenantId,
			req,
			status: result.status || 200,
			requestBody: { action: 'document_verification_checked' },
			responseBody: {
				tokenValid: result.body.tokenValid,
				documentHashMatch: result.body.documentHashMatch,
				documentStatus: result.body.documentStatus,
				anchorStatus: result.body.anchorStatus,
				merkleProofValid: result.body.merkleProofValid,
				publicCommitmentValid: result.body.publicCommitmentValid,
			},
			createdAt: now(),
		}),
	);
	await saveDb(db);

	return new Response(JSON.stringify(result.body), {
		status: result.status || 200,
	});
}
