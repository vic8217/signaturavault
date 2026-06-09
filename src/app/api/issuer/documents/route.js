import { loadDb } from '@/lib/db';
import { requireIssuerProfileContext } from '@/lib/issuer-profile';

function lower(value) {
	return String(value || '').toLowerCase();
}

function shortHash(value) {
	if (!value) return '';
	if (value.length <= 18) return value;
	return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function getBatchForDocument(db, document) {
	const proof = (db.merkle_proofs || []).find(
		(record) => record.document_id === document.id,
	);
	if (!proof) return { proof: null, batch: null };

	const batch = (db.merkle_batches || []).find(
		(record) => record.id === proof.batch_id,
	);
	return { proof, batch };
}

function getOtsStatus(document, batch) {
	if (!batch) return document.anchor_status || 'pending';
	if (batch.publish_method === 'opentimestamps') return batch.status;
	if (batch.status === 'published') return 'published';
	return batch.status || document.anchor_status || 'pending';
}

function documentSummary(rows) {
	const initial = {
		totalIssued: rows.length,
		valid: 0,
		revoked: 0,
		pendingAnchor: 0,
		timestampPending: 0,
		published: 0,
		failed: 0,
	};

	return rows.reduce((summary, row) => {
		if (row.documentStatus === 'valid') summary.valid += 1;
		if (row.documentStatus === 'revoked') summary.revoked += 1;
		if (row.anchorStatus === 'pending') summary.pendingAnchor += 1;
		if (row.otsStatus === 'timestamped_pending_confirmation') {
			summary.timestampPending += 1;
		}
		if (row.anchorStatus === 'published' || row.otsStatus === 'published') {
			summary.published += 1;
		}
		if (row.anchorStatus === 'failed' || row.otsStatus === 'failed') {
			summary.failed += 1;
		}
		return summary;
	}, initial);
}

export async function GET(req) {
	const context = await requireIssuerProfileContext();
	if (context.error) return context.error;

	const { searchParams } = new URL(req.url);
	const search = lower(searchParams.get('search'));
	const documentStatus = searchParams.get('status') || 'all';
	const otsStatus = searchParams.get('otsStatus') || 'all';

	const db = await loadDb();
	const tenantId = context.profile.tenantId;
	const documents = (db.document_records || [])
		.filter((record) => record.tenant_id === tenantId)
		.map((record) => {
			const { proof, batch } = getBatchForDocument(db, record);
			const documentHash = record.document_hash || record.hash || '';
				const row = {
					id: record.id,
					externalId: record.id,
					recipientName: '[hidden]',
					documentStatus: record.status || 'valid',
				anchorStatus: record.anchor_status || 'pending',
				otsStatus: getOtsStatus(record, batch),
				publishMethod: batch?.publish_method || null,
				batchId: batch?.id || record.anchor_batch_id || null,
				batchStatus: batch?.status || null,
				chain: batch?.chain || null,
				transactionId: batch?.transaction_id || null,
				timestampProofAvailable: Boolean(batch?.timestamp_proof),
				merkleRoot: batch?.merkle_root || null,
				proofAvailable: Boolean(proof),
				documentHash: shortHash(documentHash),
				issuedAt: record.issued_at || record.created_at || null,
				updatedAt: record.updated_at || null,
			};
				row.searchText = lower(
					[
						row.id,
						row.documentStatus,
						row.anchorStatus,
					row.otsStatus,
					row.batchId,
					row.documentHash,
				].join(' '),
			);
			return row;
		})
		.sort((a, b) => new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0));

	const filteredDocuments = documents.filter((row) => {
		if (search && !row.searchText.includes(search)) return false;
		if (documentStatus !== 'all' && row.documentStatus !== documentStatus) {
			return false;
		}
		if (
			otsStatus !== 'all' &&
			row.otsStatus !== otsStatus &&
			row.anchorStatus !== otsStatus
		) {
			return false;
		}
		return true;
	});

	return Response.json({
		issuer: {
			id: context.profile.id,
			tenantId,
			name: context.profile.name,
		},
		summary: documentSummary(documents),
		filteredCount: filteredDocuments.length,
		documents: filteredDocuments.map(({ searchText, ...row }) => row),
	});
}
