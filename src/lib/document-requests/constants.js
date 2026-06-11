const DOCUMENT_REQUEST_RECORD_TYPE = 'document_request';

const DOCUMENT_REQUEST_STATUS = {
	PENDING: 'pending',
	APPROVED: 'approved',
	DENIED: 'denied',
	ISSUED: 'issued',
	CANCELLED: 'cancelled',
};

const ACTIVE_DOCUMENT_REQUEST_STATUSES = [
	DOCUMENT_REQUEST_STATUS.PENDING,
	DOCUMENT_REQUEST_STATUS.APPROVED,
];

const TERMINAL_DOCUMENT_REQUEST_STATUSES = [
	DOCUMENT_REQUEST_STATUS.DENIED,
	DOCUMENT_REQUEST_STATUS.ISSUED,
	DOCUMENT_REQUEST_STATUS.CANCELLED,
];

const FALLBACK_REQUEST_FIELD_KEYS = ['purpose', 'privateReference', 'notes'];

const ISSUED_DOCUMENT_DELIVERY_STATUS = {
	WALLET_DELIVERED: 'wallet_delivered',
	ISSUER_RELEASE: 'issuer_release',
};

const ISSUED_DOCUMENT_LINKAGE_TYPE = {
	CREATED: 'created',
	LINKED: 'linked',
};

const ISSUED_DOCUMENT_LINKAGE_STATUS = {
	CREATED: 'created',
	LINKED: 'linked',
	NONE: 'none',
};

const DOCUMENT_REQUEST_AUDIT_ACTIONS = {
	SUBMITTED: 'document_request_submitted',
	CANCELLED: 'document_request_cancelled',
	APPROVED: 'document_request_approved',
	DENIED: 'document_request_denied',
	ISSUED: 'document_request_issued',
	ACCESS_DENIED: 'document_request_access_denied',
};

const ADMIN_SUMMARY_FIELDS = [
	'id',
	'referenceCode',
	'issuerName',
	'status',
	'documentTypeLabel',
	'submittedAt',
	'reviewedAt',
	'issuedAt',
	'cancelledAt',
];

export {
	ACTIVE_DOCUMENT_REQUEST_STATUSES,
	ADMIN_SUMMARY_FIELDS,
	DOCUMENT_REQUEST_AUDIT_ACTIONS,
	DOCUMENT_REQUEST_RECORD_TYPE,
	DOCUMENT_REQUEST_STATUS,
	FALLBACK_REQUEST_FIELD_KEYS,
	ISSUED_DOCUMENT_DELIVERY_STATUS,
	ISSUED_DOCUMENT_LINKAGE_STATUS,
	ISSUED_DOCUMENT_LINKAGE_TYPE,
	TERMINAL_DOCUMENT_REQUEST_STATUSES,
};
