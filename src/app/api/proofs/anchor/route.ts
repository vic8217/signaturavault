import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import {
	authenticateBearerToken,
	corsHeadersForRequest,
	corsPreflight,
} from '@/lib/signatura-oauth';

const ALLOWED_RECORD_TYPES = new Set([
	'visitor_pass',
	'car_pass',
	'billing_receipt',
	'resident_certificate',
	'election_vote_audit',
	'maintenance_record',
]);

export async function OPTIONS(req: Request) {
	return corsPreflight(req);
}

export async function POST(req: Request) {
	try {
		const corsHeaders = await corsHeadersForRequest(req);
		const tokenSession = await authenticateBearerToken(req);
		if (!tokenSession) {
			return jsonError('Bearer token is required or invalid', 401);
		}

		const body = await req.json().catch(() => ({}));
		const sourceApp = String(body.source_app || '');
		const recordType = String(body.record_type || '');
		const recordId = String(body.record_id || '');
		const hash = String(body.hash || '');

		if (!sourceApp || !recordType || !recordId || !hash) {
			return jsonError('source_app, record_type, record_id, and hash are required');
		}

		if (sourceApp !== 'havenxsig') {
			return jsonError('source_app must be havenxsig');
		}

		if (!ALLOWED_RECORD_TYPES.has(recordType)) {
			return jsonError('record_type is not supported');
		}

		const anchor = await prisma.auditAnchor.create({
			data: {
				sourceApp,
				recordType,
				recordId,
				hash,
				status: 'pending',
			},
		});

		return Response.json(
			{
				id: anchor.id,
				source_app: anchor.sourceApp,
				record_type: anchor.recordType,
				record_id: anchor.recordId,
				hash: anchor.hash,
				status: anchor.status,
				created_at: anchor.createdAt,
				anchored_at: anchor.anchoredAt,
			},
			{ status: 201, headers: corsHeaders },
		);
	} catch (error) {
		return jsonError(safeApiErrorMessage(error, 'Unable to anchor proof'), 400);
	}
}
