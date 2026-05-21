import { prisma } from '@/lib/prisma';
import { requireIssuerContext, templateToApi } from '@/lib/issuer-templates';

export async function GET() {
	const context = await requireIssuerContext();
	if (context.error) return context.error;

	const templates = await prisma.documentTemplate.findMany({
		where: {
			tenantId: context.tenantId,
			...(context.issuerId ? { issuerId: context.issuerId } : {}),
		},
		include: {
			templateFields: { orderBy: { sortOrder: 'asc' } },
			extractionLogs: { orderBy: { createdAt: 'desc' }, take: 1 },
		},
		orderBy: { updatedAt: 'desc' },
	});

	return Response.json({ templates: templates.map(templateToApi) });
}
