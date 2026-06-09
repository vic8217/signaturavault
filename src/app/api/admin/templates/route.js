import { prisma } from '@/lib/prisma';
import { requireAdminRole } from '@/lib/admin-auth';
import { loadDb } from '@/lib/db';
import { templateToApi } from '@/lib/issuer-templates';
import { redactTemplateForProvider } from '@/lib/security';

async function issuerMap() {
	const [issuers, devDb] = await Promise.all([
		prisma.issuer.findMany({
			select: {
				id: true,
				tenantId: true,
				name: true,
				type: true,
			},
		}),
		loadDb(),
	]);
	const map = new Map();

	for (const issuer of devDb.issuers || []) {
		const normalized = {
			id: issuer.id,
			tenantId: issuer.tenant_id,
			name: issuer.name,
			type: issuer.type,
		};
		if (normalized.id) map.set(normalized.id, normalized);
		if (normalized.tenantId) map.set(normalized.tenantId, normalized);
	}

	for (const tenant of devDb.tenants || []) {
		if (!map.has(tenant.id)) {
			map.set(tenant.id, {
				id: tenant.id,
				tenantId: tenant.id,
				name: tenant.name,
				type: 'Issuer',
			});
		}
	}

	for (const issuer of issuers) {
		if (issuer.id) map.set(issuer.id, issuer);
		if (issuer.tenantId) map.set(issuer.tenantId, issuer);
	}

	return map;
}

function withIssuer(template, issuers) {
	const issuer =
		(template.issuerId && issuers.get(template.issuerId)) ||
		issuers.get(template.tenantId);
	const apiTemplate = redactTemplateForProvider(templateToApi(template));

	return {
		...apiTemplate,
		issuer_name: issuer?.name || 'Unknown issuer',
		issuer_type: issuer?.type || null,
	};
}

export async function GET(req) {
	const auth = await requireAdminRole();
	if (auth.error) return auth.error;

	const { searchParams } = new URL(req.url);
	const issuerId = searchParams.get('issuerId') || '';
	const status = searchParams.get('status') || 'all';
	const statusFilter =
		status === 'not_published'
			? { not: 'published' }
			: status === 'all'
				? undefined
				: status;

	const [templates, issuers] = await Promise.all([
		prisma.documentTemplate.findMany({
			where: {
				...(issuerId
					? {
							OR: [{ issuerId }, { tenantId: issuerId }],
						}
					: {}),
				...(statusFilter ? { status: statusFilter } : {}),
			},
			include: {
				templateFields: { orderBy: { sortOrder: 'asc' } },
				extractionLogs: { orderBy: { createdAt: 'desc' }, take: 1 },
			},
			orderBy: { updatedAt: 'desc' },
		}),
		issuerMap(),
	]);

	return Response.json({
		templates: templates.map((template) => withIssuer(template, issuers)),
	});
}
