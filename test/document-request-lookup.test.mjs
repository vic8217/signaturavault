import test from 'node:test';
import assert from 'node:assert/strict';

import { FALLBACK_REQUEST_FIELD_KEYS } from '../src/lib/document-requests/constants.js';
import {
	assertNoForbiddenPublicKeys,
	buildFallbackFormSchema,
	isRequestableIssuer,
	resolveFormSchema,
	sanitizeOwnerFormField,
	toPublicDocumentTypeDto,
	toPublicIssuerDto,
	validateFallbackFieldKeys,
} from '../src/lib/document-request-lookupCore.mjs';

const PRIVATE_ISSUER = {
	id: 'issuer_private_1',
	tenantId: 'tenant_demo',
	name: 'Example University',
	type: 'education',
	status: 'active',
	acceptsRequests: true,
	contactEmail: 'admin@example.edu',
	address: '123 Campus Way',
	registrationNumber: 'REG-999',
	registrationDate: new Date('2020-01-01'),
};

const DOCUMENT_TYPE = {
	id: 'type_transcript',
	tenantId: 'tenant_demo',
	name: 'Official Transcript',
	description: 'Request an official academic transcript',
};

function collectKeys(record, prefix = '') {
	const keys = [];
	for (const [key, value] of Object.entries(record || {})) {
		const path = prefix ? `${prefix}.${key}` : key;
		keys.push(path);
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			keys.push(...collectKeys(value, path));
		}
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item && typeof item === 'object') {
					keys.push(...collectKeys(item, path));
				}
			}
		}
	}
	return keys;
}

test('active issuer with acceptsRequests=true is requestable', () => {
	assert.equal(isRequestableIssuer(PRIVATE_ISSUER), true);
});

test('inactive issuer does not appear in requestable lookup', () => {
	assert.equal(
		isRequestableIssuer({ ...PRIVATE_ISSUER, status: 'inactive' }),
		false,
	);
	assert.equal(
		isRequestableIssuer({ ...PRIVATE_ISSUER, status: 'suspended' }),
		false,
	);
});

test('acceptsRequests=false issuer does not appear in requestable lookup', () => {
	assert.equal(
		isRequestableIssuer({ ...PRIVATE_ISSUER, acceptsRequests: false }),
		false,
	);
});

test('public issuer DTO returns safe document types only', () => {
	const dto = toPublicIssuerDto(PRIVATE_ISSUER, {
		documentTypes: [DOCUMENT_TYPE],
		logoUrl: 'https://example.edu/logo.png',
	});

	assert.equal(dto.issuerId, 'issuer_private_1');
	assert.equal(dto.displayName, 'Example University');
	assert.equal(dto.category, 'education');
	assert.equal(dto.logoUrl, 'https://example.edu/logo.png');
	assert.equal(dto.documentTypes.length, 1);
	assert.equal(dto.documentTypes[0].documentTypeId, 'type_transcript');
	assert.equal(dto.documentTypes[0].name, 'Official Transcript');
	assert.equal(dto.documentTypes[0].description, 'Request an official academic transcript');

	const keys = collectKeys(dto);
	assert.equal(keys.includes('contactEmail'), false);
	assert.equal(keys.includes('contact_email'), false);
	assert.equal(keys.includes('address'), false);
	assert.equal(keys.includes('registrationNumber'), false);
	assert.equal(keys.includes('tenantId'), false);
	assert.equal(keys.includes('tenant_id'), false);
});

test('public document type DTO omits tenant and internal metadata', () => {
	const dto = toPublicDocumentTypeDto(DOCUMENT_TYPE, { hasPublishedTemplate: true });

	assert.deepEqual(Object.keys(dto).sort(), [
		'description',
		'documentTypeId',
		'hasPublishedTemplate',
		'name',
	]);
	assert.equal(dto.hasPublishedTemplate, true);
});

test('form schema falls back when no published template exists', () => {
	const schema = resolveFormSchema({ template: null, templateFields: [] });

	assert.equal(schema.mode, 'fallback');
	assert.equal(schema.documentTemplateId, null);
	assert.deepEqual(
		schema.fields.map((field) => field.fieldKey),
		FALLBACK_REQUEST_FIELD_KEYS,
	);

	const privateReference = schema.fields.find(
		(field) => field.fieldKey === 'privateReference',
	);
	assert.ok(privateReference);
	assert.equal(privateReference.encrypted, true);
	assert.match(privateReference.fieldLabel, /student|account|member/i);

	validateFallbackFieldKeys(schema.fields.map((field) => field.fieldKey));
});

test('form schema uses published template fields when available', () => {
	const schema = resolveFormSchema({
		template: { id: 'tpl_1', name: 'Transcript Request' },
		templateFields: [
			{
				fieldKey: 'purpose',
				fieldLabel: 'Purpose',
				fieldType: 'textarea',
				required: true,
				encrypted: true,
				defaultValue: 'secret-default',
				xPosition: 10,
				yPosition: 20,
			},
		],
	});

	assert.equal(schema.mode, 'template');
	assert.equal(schema.documentTemplateId, 'tpl_1');
	assert.equal(schema.templateName, 'Transcript Request');
	assert.equal(schema.fields.length, 1);
	assert.equal(schema.fields[0].fieldKey, 'purpose');
	assert.equal(schema.fields[0].encrypted, true);
	assert.equal(Object.hasOwn(schema.fields[0], 'defaultValue'), false);
	assert.equal(Object.hasOwn(schema.fields[0], 'xPosition'), false);
});

test('template field sanitizer marks privateReference as encrypted', () => {
	const field = sanitizeOwnerFormField({
		fieldKey: 'privateReference',
		fieldLabel: 'Member number',
		fieldType: 'text',
		required: true,
	});

	assert.equal(field.encrypted, true);
	assert.equal(field.fieldKey, 'privateReference');
});

test('forbidden public keys trigger assertion failures', () => {
	assert.throws(
		() => assertNoForbiddenPublicKeys({ contactEmail: 'leak@example.com' }),
		/contactEmail/,
	);
});
