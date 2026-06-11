import {
	ACTIVE_DOCUMENT_REQUEST_STATUSES,
	ADMIN_SUMMARY_FIELDS,
	DOCUMENT_REQUEST_RECORD_TYPE,
	DOCUMENT_REQUEST_STATUS,
	FALLBACK_REQUEST_FIELD_KEYS,
} from './document-requests/constants.js';

const PROVIDER_ADMIN_ROLES = new Set([
	'SIGNATURA_ADMIN',
	'SIGNATURA_STAFF',
	'DEV_ADMIN',
	'SUPER_ADMIN',
]);

const ISSUER_REVIEW_ROLES = new Set(['ISSUER_ADMIN', 'ISSUER_STAFF']);

const DENIAL_REASON_MAX_LENGTH = 500;
const SAFE_TEXT_PATTERN = /^[\p{L}\p{N}\p{P}\p{Zs}\n\r\t.,;:'"!?()\-_/]+$/u;

const STATUS_TRANSITIONS = {
	[DOCUMENT_REQUEST_STATUS.PENDING]: new Set([
		DOCUMENT_REQUEST_STATUS.APPROVED,
		DOCUMENT_REQUEST_STATUS.DENIED,
		DOCUMENT_REQUEST_STATUS.CANCELLED,
	]),
	[DOCUMENT_REQUEST_STATUS.APPROVED]: new Set([
		DOCUMENT_REQUEST_STATUS.ISSUED,
		DOCUMENT_REQUEST_STATUS.DENIED,
	]),
	[DOCUMENT_REQUEST_STATUS.DENIED]: new Set(),
	[DOCUMENT_REQUEST_STATUS.ISSUED]: new Set(),
	[DOCUMENT_REQUEST_STATUS.CANCELLED]: new Set(),
};

const REFERENCE_CODE_PATTERN = /^REQ-\d{4}-[A-Z0-9]{8}$/;

function isActiveDocumentRequestStatus(status) {
	return ACTIVE_DOCUMENT_REQUEST_STATUSES.includes(status);
}

function canTransitionDocumentRequestStatus(fromStatus, toStatus) {
	const allowed = STATUS_TRANSITIONS[fromStatus];
	if (!allowed) return false;
	return allowed.has(toStatus);
}

function assertValidDocumentRequestStatus(status) {
	if (!Object.values(DOCUMENT_REQUEST_STATUS).includes(status)) {
		throw new Error(`Invalid document request status: ${status}`);
	}
}

function assertPlatformAdminCannotDecrypt(role) {
	if (PROVIDER_ADMIN_ROLES.has(role)) {
		throw new Error('Provider administrators cannot decrypt document request private fields');
	}
}

function assertIssuerRoleCanReview(role) {
	if (!ISSUER_REVIEW_ROLES.has(role)) {
		throw new Error('Issuer staff role required to review document requests');
	}
	assertPlatformAdminCannotDecrypt(role);
}

function assertIssuerCanApproveRequest(status) {
	if (status !== DOCUMENT_REQUEST_STATUS.PENDING) {
		throw new Error('Only pending document requests can be approved');
	}
}

function assertIssuerCanDenyRequest(status) {
	if (
		status !== DOCUMENT_REQUEST_STATUS.PENDING &&
		status !== DOCUMENT_REQUEST_STATUS.APPROVED
	) {
		throw new Error('Only pending or approved document requests can be denied');
	}
}

function assertIssuerCanIssueRequest(status) {
	if (status !== DOCUMENT_REQUEST_STATUS.APPROVED) {
		throw new Error('Only approved document requests can be issued');
	}
}

function assertSafeDenialReason(value) {
	const normalized = String(value ?? '').trim();
	if (!normalized) {
		throw new Error('denialReason is required');
	}
	if (normalized.length > DENIAL_REASON_MAX_LENGTH) {
		throw new Error(`denialReason must be ${DENIAL_REASON_MAX_LENGTH} characters or fewer`);
	}
	if (!SAFE_TEXT_PATTERN.test(normalized)) {
		throw new Error('denialReason contains unsupported characters');
	}
	return normalized;
}

function assertPlatformAdminSummaryOnly(role) {
	if (!PROVIDER_ADMIN_ROLES.has(role)) {
		throw new Error('Admin summary access requires a platform administrator role');
	}
}

function assertOwnerCanCancelRequest(status) {
	if (status !== DOCUMENT_REQUEST_STATUS.PENDING) {
		throw new Error('Only pending document requests can be cancelled');
	}
}

function assertNoActiveDocumentRequest(existingRequest) {
	if (existingRequest && isActiveDocumentRequestStatus(existingRequest.status)) {
		throw new Error(
			'An active document request already exists for this issuer and document type',
		);
	}
}

function isWorkflowReferenceCode(value) {
	return REFERENCE_CODE_PATTERN.test(String(value || '').trim());
}

function buildWorkflowReferenceCode(now = new Date()) {
	const year = now.getUTCFullYear();
	const suffix = Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(8, '0');
	return `REQ-${year}-${suffix.slice(0, 8)}`;
}

const PLAINTEXT_SUBMIT_KEYS = new Set([
	'value',
	'plain',
	'plaintext',
	'decrypted',
	'privateReference',
	'purpose',
	'notes',
]);

function assertEncryptedSubmitPayload(body = {}) {
	for (const key of Object.keys(body)) {
		if (PLAINTEXT_SUBMIT_KEYS.has(key) && String(body[key] ?? '').trim()) {
			throw new Error(`Plaintext private field is not accepted: ${key}`);
		}
	}

	if (!Array.isArray(body.encryptedFields) || body.encryptedFields.length === 0) {
		throw new Error('encryptedFields must include at least one encrypted private field');
	}

	for (const field of body.encryptedFields) {
		for (const key of Object.keys(field)) {
			if (PLAINTEXT_SUBMIT_KEYS.has(key) && key !== 'fieldKey' && String(field[key] ?? '').trim()) {
				throw new Error(`Plaintext private field is not accepted: ${key}`);
			}
		}

		for (const required of ['fieldKey', 'keyRef', 'iv', 'tag', 'ciphertext']) {
			if (!String(field[required] ?? '').trim()) {
				throw new Error(`encryptedFields.${required} is required`);
			}
		}
	}

	const fieldKeys = body.encryptedFields.map((field) => String(field.fieldKey || '').trim());
	if (!fieldKeys.includes('privateReference')) {
		throw new Error('encryptedFields must include encrypted privateReference');
	}
}

function buildOwnerStatusMessage(request = {}) {
	switch (request.status) {
		case DOCUMENT_REQUEST_STATUS.PENDING:
			return 'Your request is waiting for issuer review.';
		case DOCUMENT_REQUEST_STATUS.APPROVED:
			return 'Your request was approved. The issuer is preparing your document.';
		case DOCUMENT_REQUEST_STATUS.DENIED:
			return 'Your request was denied by the issuer.';
		case DOCUMENT_REQUEST_STATUS.ISSUED:
			return request.walletDelivered
				? 'Digital copy is available in your Signatura wallet.'
				: 'Digital copy is ready for issuer release.';
		case DOCUMENT_REQUEST_STATUS.CANCELLED:
			return 'You cancelled this request.';
		default:
			return 'Request status updated.';
	}
}

function documentRequestToOwnerDetail(request, issuerDisplayName = '', denialReason = null) {
	const item = {
		requestId: request.id,
		referenceCode: request.referenceCode,
		issuerDisplayName: issuerDisplayName || request.issuerDisplayName || '',
		documentTypeLabel: request.documentTypeLabel || null,
		status: request.status,
		submittedAt: request.submittedAt,
		updatedAt: request.updatedAt,
		walletDeliveryAvailable:
			request.status === DOCUMENT_REQUEST_STATUS.ISSUED &&
			Boolean(request.walletDelivered),
		statusMessage: buildOwnerStatusMessage(request),
	};

	if (request.status === DOCUMENT_REQUEST_STATUS.DENIED && denialReason) {
		item.denialReason = denialReason;
	}

	for (const key of Object.keys(item)) {
		if (
			[
				'ciphertext',
				'iv',
				'tag',
				'keyRef',
				'aad',
				'ownerUserId',
				'tenantId',
				'purpose',
				'privateReference',
				'notes',
			].includes(key)
		) {
			throw new Error(`Owner detail includes private field: ${key}`);
		}
	}

	return item;
}

function documentRequestToOwnerListItem(request, issuerDisplayName = '') {
	const item = {
		requestId: request.id,
		referenceCode: request.referenceCode,
		issuerDisplayName: issuerDisplayName || request.issuerDisplayName || '',
		documentTypeLabel: request.documentTypeLabel || null,
		status: request.status,
		submittedAt: request.submittedAt,
		updatedAt: request.updatedAt,
		walletDeliveryAvailable:
			request.status === DOCUMENT_REQUEST_STATUS.ISSUED &&
			Boolean(request.walletDelivered),
		statusMessage: buildOwnerStatusMessage(request),
	};

	for (const key of Object.keys(item)) {
		if (['ciphertext', 'iv', 'tag', 'keyRef', 'aad', 'ownerUserId', 'tenantId'].includes(key)) {
			throw new Error(`Owner list item includes private field: ${key}`);
		}
	}

	return item;
}

function validateCreateDocumentRequestInput(input = {}) {
	const required = [
		'ownerUserId',
		'issuerId',
		'tenantId',
		'documentTypeId',
		'encryptedFields',
	];
	for (const key of required) {
		if (!String(input[key] ?? '').trim() && key !== 'encryptedFields') {
			throw new Error(`${key} is required`);
		}
	}

	if (!Array.isArray(input.encryptedFields) || input.encryptedFields.length === 0) {
		throw new Error('encryptedFields must include at least one encrypted private field');
	}

	for (const field of input.encryptedFields) {
		if (field.recordType && field.recordType !== DOCUMENT_REQUEST_RECORD_TYPE) {
			throw new Error('encryptedFields must use recordType document_request');
		}
		if (field.ownerUserId && field.ownerUserId !== input.ownerUserId) {
			throw new Error('encryptedFields ownerUserId must match request owner');
		}
		if (field.tenantId && field.tenantId !== input.tenantId) {
			throw new Error('encryptedFields tenantId must match issuer tenant');
		}
	}
}

function validateFallbackEncryptedFieldKeys(fieldKeys = []) {
	const normalized = new Set(fieldKeys.map((key) => String(key || '').trim()));
	for (const requiredKey of FALLBACK_REQUEST_FIELD_KEYS) {
		if (!normalized.has(requiredKey)) {
			throw new Error(`Fallback request form requires encrypted field: ${requiredKey}`);
		}
	}
}

function documentRequestToOwnerSummary(request) {
	return {
		id: request.id,
		referenceCode: request.referenceCode,
		issuerId: request.issuerId,
		tenantId: request.tenantId,
		documentTypeId: request.documentTypeId,
		documentTypeLabel: request.documentTypeLabel || null,
		documentTemplateId: request.documentTemplateId || null,
		status: request.status,
		walletDelivered: Boolean(request.walletDelivered),
		submittedAt: request.submittedAt,
		reviewedAt: request.reviewedAt || null,
		issuedAt: request.issuedAt || null,
		cancelledAt: request.cancelledAt || null,
	};
}

function documentRequestToIssuerSummary(request) {
	return {
		...documentRequestToOwnerSummary(request),
		ownerUserId: request.ownerUserId,
		reviewedByUserId: request.reviewedByUserId || null,
		issuedDocumentRecordId: request.issuedDocumentRecordId || null,
	};
}

function documentRequestToIssuerListItem(request, ownerDisplayLabel = '') {
	const item = {
		requestId: request.id,
		referenceCode: request.referenceCode,
		ownerDisplayLabel: ownerDisplayLabel || request.ownerDisplayLabel || '',
		documentTypeLabel: request.documentTypeLabel || null,
		status: request.status,
		submittedAt: request.submittedAt,
		updatedAt: request.updatedAt,
	};

	for (const key of Object.keys(item)) {
		if (
			[
				'ciphertext',
				'iv',
				'tag',
				'keyRef',
				'aad',
				'ownerUserId',
				'tenantId',
				'purpose',
				'privateReference',
				'notes',
				'denialReason',
			].includes(key)
		) {
			throw new Error(`Issuer list item includes private field: ${key}`);
		}
	}

	return item;
}

function documentRequestToAdminSummary(request, issuerName = '') {
	const summary = {
		id: request.id,
		referenceCode: request.referenceCode,
		issuerName: issuerName || request.issuerName || '',
		status: request.status,
		documentTypeLabel: request.documentTypeLabel || null,
		submittedAt: request.submittedAt,
		reviewedAt: request.reviewedAt || null,
		issuedAt: request.issuedAt || null,
		cancelledAt: request.cancelledAt || null,
	};

	for (const key of Object.keys(summary)) {
		if (!ADMIN_SUMMARY_FIELDS.includes(key)) {
			throw new Error(`Admin summary includes disallowed field: ${key}`);
		}
	}

	return summary;
}

function buildDocumentRequestAuditDetails(request, extra = {}) {
	return {
		requestId: request.id,
		referenceCode: request.referenceCode,
		issuerId: request.issuerId,
		documentTypeId: request.documentTypeId,
		documentTypeLabel: request.documentTypeLabel || null,
		status: request.status,
		...extra,
	};
}

export {
	ACTIVE_DOCUMENT_REQUEST_STATUSES,
	assertEncryptedSubmitPayload,
	assertIssuerCanApproveRequest,
	assertIssuerCanDenyRequest,
	assertIssuerCanIssueRequest,
	assertIssuerRoleCanReview,
	assertNoActiveDocumentRequest,
	assertOwnerCanCancelRequest,
	assertPlatformAdminCannotDecrypt,
	assertPlatformAdminSummaryOnly,
	assertSafeDenialReason,
	assertValidDocumentRequestStatus,
	buildDocumentRequestAuditDetails,
	buildOwnerStatusMessage,
	buildWorkflowReferenceCode,
	canTransitionDocumentRequestStatus,
	documentRequestToAdminSummary,
	documentRequestToIssuerListItem,
	documentRequestToIssuerSummary,
	documentRequestToOwnerDetail,
	documentRequestToOwnerListItem,
	documentRequestToOwnerSummary,
	isActiveDocumentRequestStatus,
	isWorkflowReferenceCode,
	validateCreateDocumentRequestInput,
	validateFallbackEncryptedFieldKeys,
};
