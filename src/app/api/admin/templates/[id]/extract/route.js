import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireAdminRole } from '@/lib/admin-auth';
import { requireSession } from '@/lib/session';
import {
	createTemplateAudit,
	normalizeField,
	templateToApi,
} from '@/lib/issuer-templates';
import { readTemplateFile } from '@/lib/template-files';
import { detectLayout, suggestFieldsFromOcr } from '@/services/ocrService';

export async function POST(_req, { params }) {
	const auth = await requireAdminRole();
	if (auth.error) return auth.error;

	const session = await requireSession();
	const { id } = await params;
	const template = await prisma.documentTemplate.findUnique({
		where: { id },
		include: { templateFields: true },
	});
	if (!template) return Response.json({ error: 'Template not found' }, { status: 404 });
	if (template.status !== 'draft') {
		return Response.json(
			{ error: 'Only draft templates can be processed.' },
			{ status: 409 },
		);
	}

	try {
		const file = await readTemplateFile(template);
		const ocrResult = await detectLayout(template.originalFileUrl, {
			templateName: template.name,
			documentType: template.documentType,
			file,
		});
		const suggestions = suggestFieldsFromOcr(ocrResult);

		const updated = await prisma.$transaction(async (tx) => {
			await tx.documentTemplateField.deleteMany({ where: { templateId: template.id } });
			await tx.documentTemplateField.createMany({
				data: suggestions.map((field, index) => ({
					id: crypto.randomUUID(),
					templateId: template.id,
					...normalizeField(field, index + 1),
				})),
			});

			await tx.templateExtractionLog.create({
				data: {
					id: crypto.randomUUID(),
					templateId: template.id,
					extractionStatus: 'completed',
					ocrProvider: ocrResult.provider,
					rawOcrJson: ocrResult,
					aiSuggestionsJson: suggestions,
				},
			});

			await createTemplateAudit(
				tx,
				template.id,
				session?.userId || null,
				'developer_ocr_extraction_completed',
				null,
				{
					provider: ocrResult.provider,
					fieldCount: suggestions.length,
				},
			);

			return tx.documentTemplate.findUnique({
				where: { id: template.id },
				include: {
					templateFields: { orderBy: { sortOrder: 'asc' } },
					extractionLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
					auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
				},
			});
		});

		return Response.json({
			template: {
				...templateToApi(updated),
				original_file_url: `/api/admin/templates/${updated.id}/file`,
				preview_image_url: `/api/admin/templates/${updated.id}/file?preview=1`,
			},
		});
	} catch (error) {
		await prisma.templateExtractionLog.create({
			data: {
				id: crypto.randomUUID(),
				templateId: template.id,
				extractionStatus: 'failed',
				ocrProvider: process.env.OCR_PROVIDER || 'mock',
				errorMessage: error instanceof Error ? error.message : 'Extraction failed',
			},
		});
		return Response.json(
			{ error: error instanceof Error ? error.message : 'Extraction failed' },
			{ status: 400 },
		);
	}
}
