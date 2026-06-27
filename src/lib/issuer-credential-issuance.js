import crypto from 'crypto';
import { createDocumentRecord } from '@/lib/document-records';
import { prisma } from '@/lib/prisma';

function credentialEncryptionKey() {
	return crypto
		.createHash('sha256')
		.update(
			process.env.CREDENTIAL_FIELD_ENCRYPTION_SECRET ||
				process.env.SESSION_SECRET ||
				'development-only-credential-field-secret-change-me',
		)
		.digest();
}

function encryptCredentialFieldValues(values) {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', credentialEncryptionKey(), iv);
	const encrypted = Buffer.concat([
		cipher.update(JSON.stringify(values || {}), 'utf8'),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return {
		algorithm: 'aes-256-gcm',
		iv: iv.toString('base64url'),
		tag: tag.toString('base64url'),
		ciphertext: encrypted.toString('base64url'),
	};
}

function hashValue(value) {
	return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function normalizeDocumentNumber(value) {
	const normalized = String(value || '').trim();
	return normalized || `DOC-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function normalizeFieldValues(template, values = {}) {
	const normalized = {};
	for (const field of template.templateFields || []) {
		const key = field.fieldKey;
		const value = values[key] ?? values[field.id] ?? '';
		const textValue = String(value ?? '').trim();
		if (field.required && !textValue) {
			throw new Error(`${field.fieldLabel} is required`);
		}
		normalized[key] = textValue;
	}
	return normalized;
}

function publicFieldValues(template, normalizedValues) {
	const publicValues = {};
	for (const field of template.templateFields || []) {
		if (field.publicVisible) {
			publicValues[field.fieldKey] = normalizedValues[field.fieldKey] || '';
		}
	}
	return publicValues;
}

function fieldValueHashes(normalizedValues) {
	return Object.fromEntries(
		Object.entries(normalizedValues).map(([key, value]) => [key, hashValue(value)]),
	);
}

function documentHashPayload({
	template,
	documentNumber,
	normalizedValues,
	issuedAt,
	issuerId,
	tenantId,
}) {
	return {
		tenantId,
		issuerId,
		templateId: template.id,
		templateVersion: template.version,
		documentNumber,
		fieldValueHashes: fieldValueHashes(normalizedValues),
		issuedAt: issuedAt.toISOString(),
	};
}

function createDocumentHash(payload) {
	return crypto
		.createHash('sha256')
		.update(JSON.stringify(payload))
		.digest('hex');
}

function findRecipientName(template, normalizedValues) {
	const candidateKeys = [
		'full_name',
		'name',
		'recipient_name',
		'given_name',
		'surname',
		'student_name',
	];
	for (const key of candidateKeys) {
		if (normalizedValues[key]) return normalizedValues[key];
	}
	const firstValue = Object.values(normalizedValues).find(Boolean);
	return firstValue || '';
}

function issuedCredentialToApi(record) {
	const credential = record.metadata?.credential || {};
	return {
		id: record.id,
		template_id: record.documentTemplateId,
		template_name: credential.templateName || '',
		template_version: credential.templateVersion || null,
		document_number: record.externalId,
		document_hash: record.documentHash || record.hash,
		verification_token: record.verificationToken,
		qr_token: record.qrToken,
		verification_url: credential.verificationUrl || '',
		rendered_file_url: credential.renderedFileUrl || '',
		status: record.status === 'valid' ? 'ISSUED' : String(record.status || '').toUpperCase(),
		anchor_status: record.anchorStatus,
		issued_at: record.issuedAt,
		recipient_name_hash: credential.recipientNameHash || '',
		private_values_encrypted: Boolean(credential.fieldValuesEncrypted),
		public_fields: credential.publicFields || {},
	};
}

async function issueDigitalCredentialFromTemplate({
	context,
	templateId,
	fieldValues,
	documentNumber,
	verificationOrigin,
}) {
	const template = await prisma.documentTemplate.findFirst({
		where: {
			id: String(templateId || '').trim(),
			tenantId: context.tenantId,
			...(context.issuerId ? { issuerId: context.issuerId } : {}),
			status: 'published',
		},
		include: { templateFields: { orderBy: { sortOrder: 'asc' } } },
	});

	if (!template) {
		throw new Error('Published template is required before issuance');
	}

	const normalizedValues = normalizeFieldValues(template, fieldValues);
	const issuedAt = new Date();
	const normalizedDocumentNumber = normalizeDocumentNumber(documentNumber);
	const recipientName = findRecipientName(template, normalizedValues);
	const hashPayload = documentHashPayload({
		template,
		documentNumber: normalizedDocumentNumber,
		normalizedValues,
		issuedAt,
		issuerId: context.issuerId,
		tenantId: context.tenantId,
	});
	const documentHash = createDocumentHash(hashPayload);
	const verificationToken = `verify_${crypto.randomBytes(16).toString('hex')}`;
	const qrToken = `qr_${crypto.randomBytes(16).toString('hex')}`;
	const verificationUrl = new URL('/verify', verificationOrigin);
	verificationUrl.searchParams.set('token', qrToken);

	const result = await createDocumentRecord({
		tenantId: context.tenantId,
		issuerId: context.issuerId,
		templateId: template.id,
		documentHash,
		documentTypeLabel: template.documentType || template.name,
		externalId: normalizedDocumentNumber,
		recipientName: '[hidden]',
		issuedAt,
		verificationToken,
		qrToken,
		metadata: {
			credential: {
				mode: 'template_issuance',
				templateId: template.id,
				templateName: template.name,
				templateVersion: template.version,
				templateStatus: template.status,
				documentNumber: normalizedDocumentNumber,
				documentHash,
				recipientNameHash: recipientName ? hashValue(recipientName) : '',
				fieldValueHashes: hashPayload.fieldValueHashes,
				fieldValuesEncrypted: encryptCredentialFieldValues(normalizedValues),
				publicFields: publicFieldValues(template, normalizedValues),
				verificationUrl: verificationUrl.toString(),
				renderedFileUrl: `/verify?token=${encodeURIComponent(qrToken)}`,
				issuerSignature: {
					algorithm: 'sha256',
					value: hashValue(
						`${context.tenantId}:${context.issuerId || ''}:${template.id}:${documentHash}`,
					),
				},
				issuedBy: context.session?.userId || null,
				issuedAt: issuedAt.toISOString(),
			},
		},
	});

	const record = await prisma.documentRecord.findFirst({
		where: { id: result.documentId },
	});
	if (!record) {
		throw new Error('Issued document could not be loaded');
	}

	return {
		document: issuedCredentialToApi(record),
	};
}

export {
	encryptCredentialFieldValues,
	issueDigitalCredentialFromTemplate,
	issuedCredentialToApi,
};
