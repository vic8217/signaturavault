import { prisma } from '@/lib/prisma';
import {
	createTemplateAudit,
	createTemplateVersion,
	findTemplateForIssuer,
	requireIssuerContext,
	templateToApi,
} from '@/lib/issuer-templates';

export async function POST(_req, { params }) {
	const context = await requireIssuerContext({ allowStaff: false });
	if (context.error) return context.error;

	const { id } = await params;
	const template = await findTemplateForIssuer(id, context, {
		templateFields: { orderBy: { sortOrder: 'asc' } },
	});
	if (!template) return Response.json({ error: 'Template not found' }, { status: 404 });

	const archived = await prisma.$transaction(async (tx) => {
		const next = await tx.documentTemplate.update({
			where: { id: template.id },
			data: { status: 'archived' },
			include: { templateFields: { orderBy: { sortOrder: 'asc' } } },
		});

		await createTemplateVersion(tx, next, context.session.userId, 'archived');
		await createTemplateAudit(tx, template.id, context.session.userId, 'template_archived', {
			status: template.status,
		}, {
			status: 'archived',
		});

		return next;
	});

	return Response.json({ template: templateToApi(archived) });
}
