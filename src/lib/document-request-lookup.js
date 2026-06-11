import { cookies } from 'next/headers';
import { loadDb } from '@/lib/db';
import { prisma } from '@/lib/prisma';
import { ROLE_COOKIE, ROLES } from '@/lib/roles';
import { requireSession } from '@/lib/session';
import { getOwnerDocumentRequestEncryptionConfig, warnIfDevRegistryEmpty } from '@/lib/document-requests';
import {
	isRequestableIssuer,
	resolveFormSchema,
	toPublicDocumentTypeDto,
	toPublicIssuerDto,
} from '@/lib/document-request-lookupCore.mjs';

async function getDevIssuerBranding(issuerId, tenantId) {
	try {
		const db = await loadDb();
		const issuer = (db.issuers || []).find(
			(item) => item.id === issuerId || item.tenant_id === tenantId,
		);
		if (!issuer) return null;
		return {
			logoUrl: issuer.logo_url || issuer.logo || null,
		};
	} catch {
		return null;
	}
}

async function requireDocumentOwnerContext() {
	const session = await requireSession();
	if (!session) {
		return {
			error: Response.json({ error: 'Authentication required' }, { status: 401 }),
		};
	}

	const cookieStore = await cookies();
	const role = cookieStore.get(ROLE_COOKIE)?.value;
	if (role !== ROLES.DOCUMENT_OWNER) {
		return {
			error: Response.json({ error: 'Document owner role required' }, { status: 403 }),
		};
	}

	return { session, role };
}

async function getRequestableIssuerById(issuerId) {
	await warnIfDevRegistryEmpty();

	const issuer = await prisma.issuer.findFirst({
		where: {
			id: issuerId,
			status: 'active',
			acceptsRequests: true,
		},
	});

	if (!issuer || !isRequestableIssuer(issuer)) {
		return null;
	}

	return issuer;
}

async function listPublicRequestIssuers() {
	await warnIfDevRegistryEmpty();

	const issuers = await prisma.issuer.findMany({
		where: {
			status: 'active',
			acceptsRequests: true,
		},
		orderBy: { name: 'asc' },
	});

	const results = [];
	for (const issuer of issuers) {
		const documentTypes = await listDocumentTypesForIssuerRecord(issuer);
		const branding = await getDevIssuerBranding(issuer.id, issuer.tenantId);
		results.push(
			toPublicIssuerDto(issuer, {
				documentTypes,
				logoUrl: branding?.logoUrl || null,
			}),
		);
	}

	return results;
}

async function listDocumentTypesForIssuerRecord(issuer) {
	const documentTypes = await prisma.documentType.findMany({
		where: { tenantId: issuer.tenantId },
		orderBy: { name: 'asc' },
	});

	const publishedTemplateTypeIds = new Set(
		(
			await prisma.documentTemplate.findMany({
				where: {
					tenantId: issuer.tenantId,
					status: 'published',
					documentTypeId: { not: null },
					...(issuer.id
						? { OR: [{ issuerId: issuer.id }, { issuerId: null }] }
						: {}),
				},
				select: { documentTypeId: true },
			})
		)
			.map((template) => template.documentTypeId)
			.filter(Boolean),
	);

	return documentTypes.map((documentType) =>
		toPublicDocumentTypeDto(documentType, {
			hasPublishedTemplate: publishedTemplateTypeIds.has(documentType.id),
		}),
	);
}

async function listIssuerDocumentTypes(issuerId) {
	const issuer = await getRequestableIssuerById(issuerId);
	if (!issuer) {
		throw new Error('Issuer is not available for document requests');
	}

	return listDocumentTypesForIssuerRecord(issuer);
}

async function findPublishedTemplateForDocumentType(issuer, documentTypeId) {
	return prisma.documentTemplate.findFirst({
		where: {
			tenantId: issuer.tenantId,
			documentTypeId,
			status: 'published',
			...(issuer.id
				? { OR: [{ issuerId: issuer.id }, { issuerId: null }] }
				: {}),
		},
		include: {
			templateFields: {
				orderBy: { sortOrder: 'asc' },
			},
		},
		orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
	});
}

async function getDocumentRequestFormSchema(issuerId, documentTypeId) {
	const issuer = await getRequestableIssuerById(issuerId);
	if (!issuer) {
		throw new Error('Issuer is not available for document requests');
	}

	const documentType = await prisma.documentType.findFirst({
		where: {
			id: documentTypeId,
			tenantId: issuer.tenantId,
		},
	});

	if (!documentType) {
		throw new Error('Document type not found for this issuer');
	}

	const template = await findPublishedTemplateForDocumentType(issuer, documentTypeId);
	const encryption = await getOwnerDocumentRequestEncryptionConfig(issuer.tenantId);

	return {
		issuerId: issuer.id,
		tenantId: issuer.tenantId,
		documentTypeId: documentType.id,
		documentTypeLabel: documentType.name,
		encryption,
		...resolveFormSchema({
			template,
			templateFields: template?.templateFields || [],
		}),
	};
}

export {
	getDocumentRequestFormSchema,
	getRequestableIssuerById,
	listIssuerDocumentTypes,
	listPublicRequestIssuers,
	requireDocumentOwnerContext,
};
