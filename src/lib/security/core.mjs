const REDACTED = '[redacted]';

const PROVIDER_ADMIN_ROLES = new Set([
	'SIGNATURA_ADMIN',
	'SIGNATURA_STAFF',
	'DEV_ADMIN',
	'SUPER_ADMIN',
]);

const PRIVATE_FIELD_KEYS = new Set([
	'address',
	'contactEmail',
	'contact_email',
	'deliveryRecords',
	'delivery_records',
	'documentMetadata',
	'document_metadata',
	'email',
	'externalId',
	'external_id',
	'homeownerName',
	'homeowner_name',
	'metadata',
	'name',
	'phone',
	'phoneNumber',
	'phone_number',
	'reason',
	'recipient',
	'recipientName',
	'recipient_name',
	'registrationNumber',
	'registration_number',
	'unit',
	'unitDetails',
	'unit_details',
	'uploadedDocument',
	'uploaded_document',
	'vehicleRecords',
	'vehicle_records',
	'visitorRecords',
	'visitor_records',
]);

const SENSITIVE_LOG_KEYS = new Set([
	...PRIVATE_FIELD_KEYS,
	'apiKey',
	'api_key',
	'authorization',
	'clientSecret',
	'client_secret',
	'key',
	'password',
	'qrToken',
	'qr_token',
	'recoveryCode',
	'recovery_code',
	'secret',
	'token',
	'verificationToken',
	'verification_token',
]);

function isProviderAdminRole(role) {
	return PROVIDER_ADMIN_ROLES.has(role);
}

function assertNotProviderAdminForPrivateData(role) {
	if (isProviderAdminRole(role)) {
		throw new Error('Provider administrators cannot access private data');
	}
}

function redactPrivateValue(value) {
	if (value === null || value === undefined || value === '') return value;
	return REDACTED;
}

function redactObject(input, keySet) {
	if (Array.isArray(input)) return input.map((item) => redactObject(item, keySet));
	if (!input || typeof input !== 'object') return input;

	return Object.fromEntries(
		Object.entries(input).map(([key, value]) => [
			key,
			keySet.has(key) ? redactPrivateValue(value) : redactObject(value, keySet),
		]),
	);
}

function redactPrivateData(input) {
	return redactObject(input, PRIVATE_FIELD_KEYS);
}

function redactForLog(input) {
	return redactObject(input, SENSITIVE_LOG_KEYS);
}

function sanitizeLogPath(url) {
	try {
		const parsed = new URL(url);
		return parsed.pathname;
	} catch {
		return String(url || '').split('?')[0];
	}
}

function safeApiLogEntry({
	id,
	tenantId,
	apiClientId = null,
	req,
	status,
	requestBody,
	responseBody,
	createdAt,
}) {
	return {
		id,
		tenant_id: tenantId,
		api_client_id: apiClientId,
		path: sanitizeLogPath(req.url),
		method: req.method,
		status,
		request_body: redactForLog(requestBody || {}),
		response_body: redactForLog(responseBody || {}),
		created_at: createdAt,
	};
}

function redactIssuerForProvider(issuer, tenant) {
	return {
		id: issuer.id,
		tenantId: issuer.tenant_id || issuer.tenantId,
		tenantName: tenant?.name || issuer.name,
		name: issuer.name,
		type: issuer.type || null,
		address: REDACTED,
		registrationNumber: REDACTED,
		registrationDate: issuer.registration_date || issuer.registrationDate || null,
		status: issuer.status,
		contactEmail: REDACTED,
		privateDataRedacted: true,
		createdAt: issuer.created_at || issuer.createdAt,
		updatedAt: issuer.updated_at || issuer.updatedAt,
	};
}

function redactedDocumentVerification(record) {
	return {
		documentId: record.id,
		externalId: REDACTED,
		recipientName: REDACTED,
		issuedAt: record.issued_at || record.issuedAt,
		privateDataRedacted: true,
	};
}

function redactTemplateForProvider(template) {
	if (!template) return template;

	return {
		...template,
		original_file_url: null,
		preview_image_url: null,
		extraction_logs: [],
		audit_logs: (template.audit_logs || []).map((log) => ({
			...log,
			oldValueJson: undefined,
			old_value_json: undefined,
			newValueJson: undefined,
			new_value_json: undefined,
		})),
		privateDataRedacted: true,
	};
}

export {
	PRIVATE_FIELD_KEYS,
	PROVIDER_ADMIN_ROLES,
	REDACTED,
	SENSITIVE_LOG_KEYS,
	assertNotProviderAdminForPrivateData,
	isProviderAdminRole,
	redactForLog,
	redactIssuerForProvider,
	redactPrivateData,
	redactTemplateForProvider,
	redactedDocumentVerification,
	safeApiLogEntry,
	sanitizeLogPath,
};
