import { prisma } from '@/lib/prisma';
import {
	createTemplateAudit,
	createTemplateVersion,
	findTemplateForIssuer,
	hashTemplatePayload,
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
	if (template.status !== 'draft') {
		return Response.json({ error: 'Only draft templates can be published' }, { status: 409 });
	}
	if (template.templateFields.length === 0) {
		return Response.json({ error: 'Review and add fields before publishing' }, { status: 400 });
	}

	const published = await prisma.$transaction(async (tx) => {
		const next = await tx.documentTemplate.update({
			where: { id: template.id },
			data: {
				status: 'published',
				publishedBy: context.session.userId,
				publishedAt: new Date(),
				schema: {
					...(template.schema || {}),
					blockchainPolicy:
						'Only template/document hashes, timestamps, and issuer signature proofs may be anchored on-chain.',
					templateHash: hashTemplatePayload(templateToApi(template)),
				},
			},
			include: { templateFields: { orderBy: { sortOrder: 'asc' } } },
		});

		await createTemplateVersion(tx, next, context.session.userId, 'published');
		await createTemplateAudit(tx, template.id, context.session.userId, 'template_published', {
			status: template.status,
		}, {
			status: 'published',
			templateHash: hashTemplatePayload(templateToApi(template)),
		});

		return next;
	});

	return Response.json({ template: templateToApi(published) });
}
