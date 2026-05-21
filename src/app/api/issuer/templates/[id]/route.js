import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import {
	createTemplateAudit,
	createTemplateVersion,
	fieldToApi,
	findTemplateForIssuer,
	normalizeField,
	requireIssuerContext,
	templateToApi,
} from '@/lib/issuer-templates';

export async function GET(_req, { params }) {
	const context = await requireIssuerContext();
	if (context.error) return context.error;

	const { id } = await params;
	const template = await findTemplateForIssuer(id, context, {
		templateFields: { orderBy: { sortOrder: 'asc' } },
		extractionLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
		auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
	});

	if (!template) return Response.json({ error: 'Template not found' }, { status: 404 });
	return Response.json({ template: templateToApi(template) });
}

export async function PUT(req, { params }) {
	const context = await requireIssuerContext();
	if (context.error) return context.error;

	const { id } = await params;
	const existing = await findTemplateForIssuer(id, context, {
		templateFields: { orderBy: { sortOrder: 'asc' } },
	});
	if (!existing) return Response.json({ error: 'Template not found' }, { status: 404 });

	const body = await req.json();
	const templateTarget =
		existing.status === 'published'
			? await createDraftVersion(existing, context)
			: existing;

	const fields = Array.isArray(body.fields) ? body.fields : null;
	const updated = await prisma.$transaction(async (tx) => {
		const nextTemplate = await tx.documentTemplate.update({
			where: { id: templateTarget.id },
			data: {
				name: String(body.name || templateTarget.name).trim(),
				documentType: String(body.document_type || body.documentType || templateTarget.documentType || '').trim(),
				status: 'draft',
			},
		});

		if (fields) {
			await tx.documentTemplateField.deleteMany({
				where: { templateId: templateTarget.id },
			});
			await tx.documentTemplateField.createMany({
				data: fields.map((field, index) => ({
					id: field.id && !String(field.id).startsWith('temp-') ? field.id : crypto.randomUUID(),
					templateId: templateTarget.id,
					...normalizeField(field, index + 1),
				})),
			});
		}

		await createTemplateAudit(tx, templateTarget.id, context.session.userId, 'template_saved_draft', templateToApi(existing), {
			name: nextTemplate.name,
			documentType: nextTemplate.documentType,
			fields: fields?.map((field, index) => fieldToApi({ id: field.id, templateId: templateTarget.id, ...normalizeField(field, index + 1) })),
		});

		const saved = await tx.documentTemplate.findUnique({
			where: { id: templateTarget.id },
			include: {
				templateFields: { orderBy: { sortOrder: 'asc' } },
				extractionLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
				auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
			},
		});
		await createTemplateVersion(tx, saved, context.session.userId, 'draft');
		return saved;
	});

	return Response.json({ template: templateToApi(updated) });
}

async function createDraftVersion(template, context) {
	const latest = await prisma.documentTemplate.findFirst({
		where: {
			tenantId: template.tenantId,
			sourceTemplateId: template.sourceTemplateId || template.id,
		},
		orderBy: { version: 'desc' },
	});
	const nextVersion = Math.max(template.version, latest?.version || 0) + 1;

	return prisma.$transaction(async (tx) => {
		const draft = await tx.documentTemplate.create({
			data: {
				id: crypto.randomUUID(),
				tenantId: template.tenantId,
				issuerId: template.issuerId,
				documentTypeId: template.documentTypeId,
				name: template.name,
				documentType: template.documentType,
				version: nextVersion,
				status: 'draft',
				originalFileUrl: template.originalFileUrl,
				previewImageUrl: template.previewImageUrl,
				createdBy: context.session.userId,
				sourceTemplateId: template.sourceTemplateId || template.id,
				schema: template.schema,
			},
		});

		await tx.documentTemplateField.createMany({
			data: template.templateFields.map((field) => ({
				id: crypto.randomUUID(),
				templateId: draft.id,
				fieldLabel: field.fieldLabel,
				fieldKey: field.fieldKey,
				fieldType: field.fieldType,
				required: field.required,
				encrypted: field.encrypted,
				publicVisible: field.publicVisible,
				searchable: field.searchable,
				validationRule: field.validationRule,
				defaultValue: field.defaultValue,
				optionsJson: field.optionsJson,
				xPosition: field.xPosition,
				yPosition: field.yPosition,
				width: field.width,
				height: field.height,
				pageNumber: field.pageNumber,
				sortOrder: field.sortOrder,
			})),
		});

		await createTemplateAudit(tx, draft.id, context.session.userId, 'draft_version_created', null, {
			sourceTemplateId: template.id,
			version: nextVersion,
		});

		return draft;
	});
}
