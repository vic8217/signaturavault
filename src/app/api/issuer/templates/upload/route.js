import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import {
	createTemplateAudit,
	requireIssuerContext,
	templateToApi,
} from '@/lib/issuer-templates';
import { storeTemplateUpload } from '@/lib/template-files';

export async function POST(req) {
	const context = await requireIssuerContext();
	if (context.error) return context.error;

	try {
		const formData = await req.formData();
		const file = formData.get('file');
		const name = String(formData.get('name') || '').trim();
		const documentType = String(formData.get('document_type') || '').trim();
		const samplePolicy =
			String(formData.get('sample_policy') || 'placeholder').trim() ===
			'contains_real_data'
				? 'contains_real_data'
				: 'placeholder';
		const autoRedactBeforeOcr =
			String(formData.get('auto_redact_before_ocr') || 'true') !== 'false';

		if (!file || typeof file.arrayBuffer !== 'function') {
			return Response.json({ error: 'A JPG, PNG, or PDF file is required' }, { status: 400 });
		}

		const templateId = crypto.randomUUID();
		const stored = await storeTemplateUpload(file, templateId);
		const templateName =
			name || String(file.name || 'Uploaded template').replace(/\.[^.]+$/, '');

		const template = await prisma.$transaction(async (tx) => {
			const created = await tx.documentTemplate.create({
				data: {
					id: templateId,
					tenantId: context.tenantId,
					issuerId: context.issuerId,
					name: templateName,
					documentType: documentType || 'Unclassified document',
					version: 1,
					status: 'draft',
					originalFileUrl: stored.fileUrl,
					previewImageUrl: stored.previewUrl,
					createdBy: context.session.userId,
					schema: {
						storage: 'local-secure',
						originalFileName: stored.filename,
						sourceFileName: file.name || stored.filename,
						mimeType: stored.mimeType,
						size: file.size || null,
						samplePolicy,
						autoRedactBeforeOcr:
							samplePolicy === 'contains_real_data'
								? autoRedactBeforeOcr
								: true,
						sampleGuidance:
							'Preferred samples use placeholders such as [STUDENT NAME], [EMPLOYEE ID], and [DATE OF BIRTH].',
						securityNotice:
							'Original files are stored for issuer review only. Private document data must not be placed on-chain.',
					},
				},
				include: { templateFields: true, extractionLogs: true },
			});

			await createTemplateAudit(tx, created.id, context.session.userId, 'template_uploaded', null, {
				name: created.name,
				documentType: created.documentType,
				originalFileUrl: created.originalFileUrl,
				samplePolicy,
				autoRedactBeforeOcr:
					samplePolicy === 'contains_real_data' ? autoRedactBeforeOcr : true,
			});

			return created;
		});

		return Response.json({ template: templateToApi(template) }, { status: 201 });
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : 'Unable to upload template' },
			{ status: 400 },
		);
	}
}
