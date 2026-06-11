import {
	listMergedIssuerDocumentRecords,
	summarizeIssuerDocuments,
} from '@/lib/document-records';
import { requireIssuerProfileContext } from '@/lib/issuer-profile';

export async function GET(req) {
	const context = await requireIssuerProfileContext();
	if (context.error) return context.error;

	const { searchParams } = new URL(req.url);
	const tenantId = context.profile.tenantId;

	const { rows, filteredDocuments } = await listMergedIssuerDocumentRecords(tenantId, {
		search: searchParams.get('search'),
		status: searchParams.get('status') || 'all',
		anchorStatus: searchParams.get('anchorStatus') || searchParams.get('otsStatus') || 'all',
	});

	return Response.json({
		issuer: {
			id: context.profile.id,
			tenantId,
			name: context.profile.name,
		},
		summary: summarizeIssuerDocuments(rows),
		filteredCount: filteredDocuments.length,
		documents: filteredDocuments.map(({ searchText, ...row }) => row),
	});
}
