import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import {
	createTemplateAudit,
	findTemplateForIssuer,
	normalizeField,
	requireIssuerContext,
	templateToApi,
} from '@/lib/issuer-templates';
import { readTemplateFile } from '@/lib/template-files';
import { detectLayout, suggestFieldsFromOcr } from '@/services/ocrService';

function redactOcrTextForStorage(value) {
	if (typeof value === 'string' && value.trim()) return '[redacted]';
	if (Array.isArray(value)) return value.map(redactOcrTextForStorage);
	if (value && typeof value === 'object') return redactOcrResultForStorage(value);
	return value;
}

function redactOcrResultForStorage(result) {
	const redacted = { ...result };
	if ('text' in redacted) redacted.text = redactOcrTextForStorage(redacted.text);
	if (Array.isArray(redacted.text_blocks)) {
		redacted.text_blocks = redacted.text_blocks.map((block) => ({
			...block,
			text: redactOcrTextForStorage(block.text),
		}));
	}
	if (Array.isArray(redacted.raw_pages)) {
		redacted.raw_pages = redacted.raw_pages.map(redactOcrResultForStorage);
	}
	redacted.redaction = {
		applied: true,
		reason: 'issuer_declared_sample_contains_real_data',
		scope: 'ocr_text_storage',
	};
	return redacted;
}

export async function POST(_req, { params }) {
	const ocrProvider = process.env.OCR_PROVIDER || 'mock';
	if (process.env.NODE_ENV === 'production' && ocrProvider === 'mock') {
		return Response.json(
			{ error: 'Mock OCR is disabled in production' },
			{ status: 503 },
		);
	}

	const context = await requireIssuerContext();
	if (context.error) return context.error;

	const { id } = await params;
	const template = await findTemplateForIssuer(id, context, {
		templateFields: true,
	});
	if (!template) return Response.json({ error: 'Template not found' }, { status: 404 });
	if (template.status !== 'draft') {
		return Response.json(
			{ error: 'Only draft templates can be processed. Create a draft version before re-extracting.' },
			{ status: 409 },
		);
	}
	const samplePolicy = template.schema?.samplePolicy || 'placeholder';
	const autoRedactBeforeOcr = template.schema?.autoRedactBeforeOcr !== false;
	if (samplePolicy === 'contains_real_data' && !autoRedactBeforeOcr) {
		return Response.json(
			{
				error:
					'This sample is marked as containing real data. Enable automatic redaction before OCR processing.',
			},
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
		const storedOcrResult =
			samplePolicy === 'contains_real_data'
				? redactOcrResultForStorage(ocrResult)
				: ocrResult;

		const updated = await prisma.$transaction(async (tx) => {
			if (samplePolicy === 'contains_real_data') {
				await tx.documentTemplate.update({
					where: { id: template.id },
					data: {
						schema: {
							...(template.schema || {}),
							autoRedactBeforeOcr: true,
							redactionAppliedBeforeOcr: true,
							redactionNotice:
								'OCR text storage was redacted because the issuer declared the sample may contain real personal data.',
						},
					},
				});
			}
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
					ocrProvider: storedOcrResult.provider,
					rawOcrJson: storedOcrResult,
					aiSuggestionsJson: suggestions,
				},
			});

			await createTemplateAudit(tx, template.id, context.session.userId, 'ocr_extraction_completed', null, {
				provider: ocrResult.provider,
				fieldCount: suggestions.length,
				redactionApplied: samplePolicy === 'contains_real_data',
			});

			return tx.documentTemplate.findUnique({
				where: { id: template.id },
				include: {
					templateFields: { orderBy: { sortOrder: 'asc' } },
					extractionLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
					auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
				},
			});
		});

		return Response.json({ template: templateToApi(updated) });
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
