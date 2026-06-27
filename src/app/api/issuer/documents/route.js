import {
	listMergedIssuerDocumentRecords,
	summarizeIssuerDocuments,
} from '@/lib/document-records';
import { issueDigitalCredentialFromTemplate } from '@/lib/issuer-credential-issuance';
import { requireIssuerProfileContext } from '@/lib/issuer-profile';
import { requireIssuerContext } from '@/lib/issuer-templates';
import { resolvePublicSignaturaOrigin } from '@/lib/publicOrigin';

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

export async function POST(req) {
	try {
		const context = await requireIssuerContext();
		if (context.error) return context.error;

		const body = await req.json().catch(() => ({}));
		const result = await issueDigitalCredentialFromTemplate({
			context,
			templateId: body.templateId || body.template_id,
			fieldValues: body.fieldValues || body.field_values || {},
			documentNumber: body.documentNumber || body.document_number,
			verificationOrigin: resolvePublicSignaturaOrigin(req),
		});

		return Response.json(result, { status: 201 });
	} catch (error) {
		return Response.json(
			{
				error:
					error instanceof Error
						? error.message
						: 'Unable to issue digital document',
			},
			{ status: 400 },
		);
	}
}
