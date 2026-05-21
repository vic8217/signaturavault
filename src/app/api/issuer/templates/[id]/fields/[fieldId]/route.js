import { prisma } from '@/lib/prisma';
import {
	createTemplateAudit,
	fieldToApi,
	findTemplateForIssuer,
	normalizeField,
	requireIssuerContext,
} from '@/lib/issuer-templates';

export async function PUT(req, { params }) {
	const context = await requireIssuerContext();
	if (context.error) return context.error;

	const { id, fieldId } = await params;
	const template = await findTemplateForIssuer(id, context);
	if (!template) return Response.json({ error: 'Template not found' }, { status: 404 });
	if (template.status !== 'draft') {
		return Response.json({ error: 'Fields can only be edited on draft templates' }, { status: 409 });
	}

	const existing = await prisma.documentTemplateField.findFirst({
		where: { id: fieldId, templateId: template.id },
	});
	if (!existing) return Response.json({ error: 'Field not found' }, { status: 404 });

	const body = await req.json();
	const normalized = normalizeField(body, existing.sortOrder);
	const field = await prisma.$transaction(async (tx) => {
		const updated = await tx.documentTemplateField.update({
			where: { id: existing.id },
			data: normalized,
		});

		await createTemplateAudit(tx, template.id, context.session.userId, 'field_updated', fieldToApi(existing), fieldToApi(updated));
		return updated;
	});

	return Response.json({ field: fieldToApi(field) });
}

export async function DELETE(_req, { params }) {
	const context = await requireIssuerContext();
	if (context.error) return context.error;

	const { id, fieldId } = await params;
	const template = await findTemplateForIssuer(id, context);
	if (!template) return Response.json({ error: 'Template not found' }, { status: 404 });
	if (template.status !== 'draft') {
		return Response.json({ error: 'Fields can only be deleted from draft templates' }, { status: 409 });
	}

	const existing = await prisma.documentTemplateField.findFirst({
		where: { id: fieldId, templateId: template.id },
	});
	if (!existing) return Response.json({ error: 'Field not found' }, { status: 404 });

	await prisma.$transaction(async (tx) => {
		await tx.documentTemplateField.delete({ where: { id: existing.id } });
		await createTemplateAudit(tx, template.id, context.session.userId, 'field_deleted', fieldToApi(existing), null);
	});

	return Response.json({ ok: true });
}
