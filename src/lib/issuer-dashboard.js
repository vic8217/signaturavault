import { loadDb } from '@/lib/db';
import {
	listMergedIssuerDocumentRecords,
	summarizeIssuerDocuments,
} from '@/lib/document-records';
import { prisma } from '@/lib/prisma';

function formatActivityTime(value) {
	if (!value) return '';
	return new Intl.DateTimeFormat('en', {
		month: 'short',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	}).format(new Date(value));
}


async function countActiveTemplates(tenantId, issuerId) {
	try {
		const templates = await prisma.documentTemplate.findMany({
			where: {
				tenantId,
				status: { not: 'archived' },
				...(issuerId ? { issuerId } : {}),
			},
			select: { id: true, status: true },
		});

		return {
			activeTemplates: templates.length,
			publishedTemplates: templates.filter((item) => item.status === 'published')
				.length,
		};
	} catch {
		return { activeTemplates: 0, publishedTemplates: 0 };
	}
}

async function loadTemplateActivity(tenantId, issuerId) {
	try {
		const logs = await prisma.templateAuditLog.findMany({
			where: {
				template: {
					tenantId,
					...(issuerId ? { issuerId } : {}),
				},
			},
			orderBy: { createdAt: 'desc' },
			take: 6,
			include: {
				template: { select: { name: true } },
			},
		});

		return logs.map((log) => ({
			id: log.id,
			kind: 'template',
			action: log.action.replaceAll('_', ' '),
			target: log.template?.name || 'Template',
			createdAt: log.createdAt.toISOString(),
			label: formatActivityTime(log.createdAt),
		}));
	} catch {
		return [];
	}
}

function loadRegistryActivity(db, tenantId) {
	const auditItems = (db.audit_logs || [])
		.filter((row) => row.tenant_id === tenantId)
		.map((row) => ({
			id: row.id,
			kind: 'audit',
			action: row.action || 'Tenant event',
			target: row.target || 'Issuer tenant',
			createdAt: row.created_at,
			label: formatActivityTime(row.created_at),
		}));

	const verifyItems = (db.api_logs || [])
		.filter(
			(row) =>
				row.tenant_id === tenantId &&
				String(row.path || '').toLowerCase().includes('verify'),
		)
		.map((row) => ({
			id: row.id,
			kind: 'verification',
			action: 'Verification scan',
			target: row.path || 'Verify endpoint',
			createdAt: row.created_at,
			label: formatActivityTime(row.created_at),
		}));

	return [...auditItems, ...verifyItems]
		.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
		.slice(0, 8);
}

async function loadIssuerDashboard(profile) {
	const tenantId = profile.tenantId;
	const issuerId = profile.id;
	const db = await loadDb();

	const { rows, filteredDocuments } = await listMergedIssuerDocumentRecords(tenantId);
	const summary = summarizeIssuerDocuments(rows);
	const documentsPayload = {
		summary: {
			totalIssued: summary.totalIssued,
			valid: summary.valid,
			revoked: summary.revoked,
			pendingAnchor: summary.pendingAnchor,
			published: summary.published,
		},
		filteredCount: filteredDocuments.length,
		documents: filteredDocuments.map(({ searchText, ...row }) => row),
	};
	const verificationScans =
		(db.verification_tokens || []).filter((row) => row.tenant_id === tenantId)
			.length +
		(db.api_logs || []).filter(
			(row) =>
				row.tenant_id === tenantId &&
				String(row.path || '').toLowerCase().includes('verify'),
		).length;

	const templateCounts = await countActiveTemplates(tenantId, issuerId);
	const templateActivity = await loadTemplateActivity(tenantId, issuerId);
	const registryActivity = loadRegistryActivity(db, tenantId);
	const recentActivity = [...templateActivity, ...registryActivity]
		.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
		.slice(0, 8);

	return {
		issuer: {
			id: profile.id,
			tenantId,
			name: profile.name,
		},
		metrics: {
			pendingRequests: 0,
			pendingRequestsAvailable: false,
			documentsIssued: summary.totalIssued,
			validDocuments: summary.valid,
			verificationScans,
			verificationAnalyticsAvailable: false,
			activeTemplates: templateCounts.activeTemplates,
			publishedTemplates: templateCounts.publishedTemplates,
			pendingAnchor: summary.pendingAnchor,
		},
		recentActivity,
		documentsPayload,
	};
}

export { loadIssuerDashboard };
