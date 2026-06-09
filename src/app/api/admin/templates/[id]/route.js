import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireAdminRole } from '@/lib/admin-auth';
import { loadDb } from '@/lib/db';
import { requireSession } from '@/lib/session';
import {
	createTemplateAudit,
	createTemplateVersion,
	fieldToApi,
	normalizeField,
	templateToApi,
} from '@/lib/issuer-templates';
import { redactTemplateForProvider } from '@/lib/security';

async function findTemplate(id, include = {}) {
	return prisma.documentTemplate.findUnique({
		where: { id },
		include,
	});
}

async function templateIssuer(template) {
	if (!template) return null;
	const issuer = await prisma.issuer.findFirst({
		where: {
			OR: [
				...(template.issuerId ? [{ id: template.issuerId }] : []),
				{ tenantId: template.tenantId },
			],
		},
		select: { name: true, type: true },
	});
	if (issuer) return issuer;

	const db = await loadDb();
	const devIssuer = (db.issuers || []).find(
		(record) =>
			record.id === template.issuerId || record.tenant_id === template.tenantId,
	);
	if (devIssuer) {
		return {
			name: devIssuer.name,
			type: devIssuer.type || 'Issuer',
		};
	}

	const devTenant = (db.tenants || []).find(
		(record) => record.id === template.tenantId,
	);
	if (devTenant) {
		return {
			name: devTenant.name,
			type: 'Issuer',
		};
	}

	return null;
}

async function requireAdminSession() {
	const auth = await requireAdminRole();
	if (auth.error) return auth;

	const session = await requireSession();
	return { auth, session };
}

export async function GET(_req, { params }) {
	const context = await requireAdminSession();
	if (context.error) return context.error;

	const { id } = await params;
	const template = await findTemplate(id, {
		templateFields: { orderBy: { sortOrder: 'asc' } },
		extractionLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
		auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
	});

	if (!template) return Response.json({ error: 'Template not found' }, { status: 404 });

	const issuer = await templateIssuer(template);
	const apiTemplate = redactTemplateForProvider(templateToApi(template));
	return Response.json({
		template: {
			...apiTemplate,
			issuer_name: issuer?.name || 'Unknown issuer',
			issuer_type: issuer?.type || null,
		},
	});
}

export async function PUT(req, { params }) {
	const context = await requireAdminSession();
	if (context.error) return context.error;

	const { id } = await params;
	const existing = await findTemplate(id, {
		templateFields: { orderBy: { sortOrder: 'asc' } },
	});
	if (!existing) return Response.json({ error: 'Template not found' }, { status: 404 });
	if (existing.status !== 'draft') {
		return Response.json(
			{ error: 'Developer support can only edit draft templates.' },
			{ status: 409 },
		);
	}

	const body = await req.json();
	const fields = Array.isArray(body.fields) ? body.fields : null;
	const updated = await prisma.$transaction(async (tx) => {
		const nextTemplate = await tx.documentTemplate.update({
			where: { id: existing.id },
			data: {
				name: String(body.name || existing.name).trim(),
				documentType: String(
					body.document_type || body.documentType || existing.documentType || '',
				).trim(),
				status: 'draft',
			},
		});

		if (fields) {
			await tx.documentTemplateField.deleteMany({
				where: { templateId: existing.id },
			});
			await tx.documentTemplateField.createMany({
				data: fields.map((field, index) => ({
					id:
						field.id && !String(field.id).startsWith('temp-')
							? field.id
							: crypto.randomUUID(),
					templateId: existing.id,
					...normalizeField(field, index + 1),
				})),
			});
		}

		await createTemplateAudit(
			tx,
			existing.id,
			context.session?.userId || null,
			'developer_template_assisted',
			redactTemplateForProvider(templateToApi(existing)),
			redactTemplateForProvider({
				name: nextTemplate.name,
				documentType: nextTemplate.documentType,
				fields: fields?.map((field, index) =>
					fieldToApi({
						id: field.id,
						templateId: existing.id,
						...normalizeField(field, index + 1),
					}),
				),
			}),
		);

		const saved = await tx.documentTemplate.findUnique({
			where: { id: existing.id },
			include: {
				templateFields: { orderBy: { sortOrder: 'asc' } },
				extractionLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
				auditLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
			},
		});
		await createTemplateVersion(tx, saved, context.session?.userId || null, 'draft');
		return saved;
	});

	const issuer = await templateIssuer(updated);
	const apiTemplate = redactTemplateForProvider(templateToApi(updated));
	return Response.json({
		template: {
			...apiTemplate,
			issuer_name: issuer?.name || 'Unknown issuer',
			issuer_type: issuer?.type || null,
		},
	});
}
