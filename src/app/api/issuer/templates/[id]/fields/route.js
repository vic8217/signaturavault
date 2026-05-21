import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import {
	createTemplateAudit,
	fieldToApi,
	findTemplateForIssuer,
	normalizeField,
	requireIssuerContext,
} from '@/lib/issuer-templates';

export async function POST(req, { params }) {
	const context = await requireIssuerContext();
	if (context.error) return context.error;

	const { id } = await params;
	const template = await findTemplateForIssuer(id, context);
	if (!template) return Response.json({ error: 'Template not found' }, { status: 404 });
	if (template.status !== 'draft') {
		return Response.json({ error: 'Fields can only be added to draft templates' }, { status: 409 });
	}

	const body = await req.json();
	const count = await prisma.documentTemplateField.count({ where: { templateId: template.id } });
	const normalized = normalizeField(body, count + 1);

	const field = await prisma.$transaction(async (tx) => {
		const created = await tx.documentTemplateField.create({
			data: {
				id: crypto.randomUUID(),
				templateId: template.id,
				...normalized,
			},
		});

		await createTemplateAudit(tx, template.id, context.session.userId, 'field_created', null, fieldToApi(created));
		return created;
	});

	return Response.json({ field: fieldToApi(field) }, { status: 201 });
}
