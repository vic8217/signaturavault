import { FALLBACK_REQUEST_FIELD_KEYS } from './document-requests/constants.js';

const FORBIDDEN_PUBLIC_KEYS = new Set([
	'contactEmail',
	'contact_email',
	'address',
	'registrationNumber',
	'registration_number',
	'registrationDate',
	'registration_date',
	'tenantId',
	'tenant_id',
	'privateDataRedacted',
	'original_file_url',
	'originalFileUrl',
	'preview_image_url',
	'previewImageUrl',
	'audit_logs',
	'extraction_logs',
	'template_hash',
	'created_by',
	'published_by',
	'ciphertext',
	'keyRef',
	'key_ref',
	'iv',
	'tag',
	'default_value',
	'defaultValue',
	'x_position',
	'y_position',
	'width',
	'height',
	'page_number',
]);

function normalizeIssuerStatus(status) {
	return String(status || '').trim().toLowerCase();
}

function isRequestableIssuer(issuer) {
	if (!issuer) return false;
	return (
		normalizeIssuerStatus(issuer.status) === 'active' && issuer.acceptsRequests === true
	);
}

function sanitizePublicRecord(record = {}) {
	const sanitized = {};
	for (const [key, value] of Object.entries(record)) {
		if (FORBIDDEN_PUBLIC_KEYS.has(key)) continue;
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			sanitized[key] = sanitizePublicRecord(value);
		} else {
			sanitized[key] = value;
		}
	}
	return sanitized;
}

function toPublicDocumentTypeDto(documentType, { hasPublishedTemplate = false } = {}) {
	return sanitizePublicRecord({
		documentTypeId: documentType.id,
		name: documentType.name,
		description: documentType.description || null,
		hasPublishedTemplate,
	});
}

function toPublicIssuerDto(issuer, { documentTypes = [], logoUrl = null } = {}) {
	const dto = sanitizePublicRecord({
		issuerId: issuer.id,
		displayName: issuer.name,
		category: issuer.type || null,
		logoUrl: logoUrl || null,
		documentTypes: documentTypes.map((documentType) =>
			typeof documentType.documentTypeId === 'string'
				? sanitizePublicRecord(documentType)
				: toPublicDocumentTypeDto(documentType, {
						hasPublishedTemplate: Boolean(documentType.hasPublishedTemplate),
					}),
		),
	});

	assertNoForbiddenPublicKeys(dto);
	return dto;
}

function assertNoForbiddenPublicKeys(record, path = '') {
	for (const [key, value] of Object.entries(record || {})) {
		const fullKey = path ? `${path}.${key}` : key;
		if (FORBIDDEN_PUBLIC_KEYS.has(key)) {
			throw new Error(`Private issuer field leaked in public DTO: ${fullKey}`);
		}
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			assertNoForbiddenPublicKeys(value, fullKey);
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item && typeof item === 'object') {
					assertNoForbiddenPublicKeys(item, fullKey);
				}
			}
		}
	}
}

function sanitizeOwnerFormField(field = {}) {
	const fieldKey = String(field.fieldKey || field.field_key || '').trim();
	const fieldType = String(field.fieldType || field.field_type || 'text').trim();
	const encrypted =
		Boolean(field.encrypted) || fieldType === 'encrypted_text' || fieldKey === 'privateReference';

	return sanitizePublicRecord({
		fieldKey,
		fieldLabel: String(field.fieldLabel || field.field_label || fieldKey).trim(),
		fieldType,
		required: Boolean(field.required),
		encrypted,
		options: field.optionsJson || field.options_json || null,
	});
}

function buildFallbackFormSchema() {
	return {
		mode: 'fallback',
		documentTemplateId: null,
		fields: [
			{
				fieldKey: 'purpose',
				fieldLabel: 'Purpose',
				fieldType: 'textarea',
				required: true,
				encrypted: true,
			},
			{
				fieldKey: 'privateReference',
				fieldLabel: 'Student / account / member number',
				fieldType: 'text',
				required: true,
				encrypted: true,
			},
			{
				fieldKey: 'notes',
				fieldLabel: 'Notes',
				fieldType: 'textarea',
				required: false,
				encrypted: true,
			},
		],
	};
}

function buildTemplateFormSchema(template, templateFields = []) {
	const fields = templateFields
		.map(sanitizeOwnerFormField)
		.filter((field) => field.fieldKey);

	return {
		mode: 'template',
		documentTemplateId: template.id,
		templateName: template.name,
		fields,
	};
}

function resolveFormSchema({ template, templateFields }) {
	if (template) {
		return buildTemplateFormSchema(template, templateFields);
	}
	return buildFallbackFormSchema();
}

function validateFallbackFieldKeys(fieldKeys = []) {
	const normalized = new Set(fieldKeys.map((key) => String(key || '').trim()));
	for (const requiredKey of FALLBACK_REQUEST_FIELD_KEYS) {
		if (!normalized.has(requiredKey)) {
			throw new Error(`Fallback schema missing required field: ${requiredKey}`);
		}
	}
}

export {
	assertNoForbiddenPublicKeys,
	buildFallbackFormSchema,
	buildTemplateFormSchema,
	isRequestableIssuer,
	normalizeIssuerStatus,
	resolveFormSchema,
	sanitizeOwnerFormField,
	toPublicDocumentTypeDto,
	toPublicIssuerDto,
	validateFallbackFieldKeys,
};
