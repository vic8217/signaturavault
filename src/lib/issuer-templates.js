import crypto from 'crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { ROLE_COOKIE, ROLES } from '@/lib/roles';
import { requireSession } from '@/lib/session';

const TEMPLATE_STATUSES = new Set(['draft', 'published', 'archived']);
const FIELD_TYPES = new Set([
	'text',
	'number',
	'date',
	'dropdown',
	'checkbox',
	'photo',
	'signature',
	'qr',
	'barcode',
	'file',
	'textarea',
	'encrypted_text',
]);

function hashTemplatePayload(payload) {
	return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function requireIssuerContext({ allowStaff = true } = {}) {
	const session = await requireSession();
	if (!session) {
		return { error: Response.json({ error: 'Authentication required' }, { status: 401 }) };
	}

	const cookieStore = await cookies();
	const role = cookieStore.get(ROLE_COOKIE)?.value;
	const allowedRoles = allowStaff
		? [ROLES.ISSUER_ADMIN, ROLES.ISSUER_STAFF]
		: [ROLES.ISSUER_ADMIN];

	if (!allowedRoles.includes(role)) {
		return { error: Response.json({ error: 'Issuer role required' }, { status: 403 }) };
	}

	const issuerUser = await prisma.issuerUser.findFirst({
		where: {
			userId: session.userId,
			status: 'active',
		},
		orderBy: { activatedAt: 'desc' },
	});

	if (!issuerUser) {
		return { error: Response.json({ error: 'Active issuer account required' }, { status: 403 }) };
	}

	return {
		session,
		role,
		issuerUser,
		tenantId: issuerUser.tenantId,
		issuerId: issuerUser.issuerId,
	};
}

async function findTemplateForIssuer(id, context, include = {}) {
	return prisma.documentTemplate.findFirst({
		where: {
			id,
			tenantId: context.tenantId,
			...(context.issuerId ? { issuerId: context.issuerId } : {}),
		},
		include,
	});
}

async function createTemplateAudit(tx, templateId, userId, action, oldValue, newValue) {
	return tx.templateAuditLog.create({
		data: {
			id: crypto.randomUUID(),
			templateId,
			userId,
			action,
			oldValueJson: oldValue || undefined,
			newValueJson: newValue || undefined,
		},
	});
}

async function createTemplateVersion(tx, template, userId, status = template.status) {
	const fields = template.templateFields?.map(fieldToApi) || [];
	const payload = {
		id: template.id,
		name: template.name,
		documentType: template.documentType,
		version: template.version,
		status,
		fields,
	};

	return tx.templateVersion.create({
		data: {
			id: crypto.randomUUID(),
			templateId: template.id,
			version: template.version,
			status,
			schemaJson: template.schema || undefined,
			fieldsJson: fields,
			templateHash: hashTemplatePayload(payload),
			createdBy: userId,
		},
	});
}

function normalizeStatus(status, fallback = 'draft') {
	const normalized = String(status || fallback).trim().toLowerCase();
	return TEMPLATE_STATUSES.has(normalized) ? normalized : fallback;
}

function normalizeField(input = {}, sortOrder = 0) {
	const fieldLabel = String(input.field_label || input.fieldLabel || 'Untitled field').trim();
	const fieldKey = String(input.field_key || input.fieldKey || fieldLabel)
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	const requestedType = String(input.field_type || input.fieldType || 'text').trim();
	const fieldType = FIELD_TYPES.has(requestedType) ? requestedType : 'text';

	return {
		fieldLabel,
		fieldKey,
		fieldType,
		required: Boolean(input.required),
		encrypted: Boolean(input.encrypted || fieldType === 'encrypted_text'),
		publicVisible: Boolean(input.public_visible ?? input.publicVisible),
		searchable: Boolean(input.searchable),
		validationRule: String(input.validation_rule || input.validationRule || '').trim() || null,
		defaultValue: String(input.default_value || input.defaultValue || '').trim() || null,
		optionsJson: input.options_json ?? input.optionsJson ?? undefined,
		xPosition: Number(input.x_position ?? input.xPosition ?? 0),
		yPosition: Number(input.y_position ?? input.yPosition ?? 0),
		width: Number(input.width ?? 20),
		height: Number(input.height ?? 8),
		pageNumber: Number(input.page_number ?? input.pageNumber ?? 1),
		sortOrder: Number(input.sort_order ?? input.sortOrder ?? sortOrder),
	};
}

function fieldToApi(field) {
	return {
		id: field.id,
		template_id: field.templateId,
		field_label: field.fieldLabel,
		field_key: field.fieldKey,
		field_type: field.fieldType,
		required: field.required,
		encrypted: field.encrypted,
		public_visible: field.publicVisible,
		searchable: field.searchable,
		validation_rule: field.validationRule,
		default_value: field.defaultValue,
		options_json: field.optionsJson,
		x_position: field.xPosition,
		y_position: field.yPosition,
		width: field.width,
		height: field.height,
		page_number: field.pageNumber,
		sort_order: field.sortOrder,
	};
}

function templateToApi(template) {
	return {
		id: template.id,
		issuer_id: template.issuerId,
		tenant_id: template.tenantId,
		name: template.name,
		document_type: template.documentType,
		version: template.version,
		status: template.status,
		sample_policy: template.schema?.samplePolicy || 'placeholder',
		auto_redact_before_ocr: template.schema?.autoRedactBeforeOcr !== false,
		redaction_applied_before_ocr: Boolean(
			template.schema?.redactionAppliedBeforeOcr,
		),
		original_file_url: template.originalFileUrl,
		preview_image_url: template.previewImageUrl,
		created_by: template.createdBy,
		published_by: template.publishedBy,
		published_at: template.publishedAt,
		source_template_id: template.sourceTemplateId,
		template_hash: hashTemplatePayload({
			id: template.id,
			name: template.name,
			documentType: template.documentType,
			version: template.version,
			fields: template.templateFields?.map(fieldToApi) || [],
		}),
		fields: template.templateFields?.map(fieldToApi) || [],
		extraction_logs: template.extractionLogs || [],
		audit_logs: template.auditLogs || [],
		created_at: template.createdAt,
		updated_at: template.updatedAt,
	};
}

export {
	FIELD_TYPES,
	TEMPLATE_STATUSES,
	createTemplateAudit,
	createTemplateVersion,
	fieldToApi,
	findTemplateForIssuer,
	hashTemplatePayload,
	normalizeField,
	normalizeStatus,
	requireIssuerContext,
	templateToApi,
};
