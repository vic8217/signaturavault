import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireDocumentOwnerContext } from '@/lib/document-request-lookup';
import { getDocumentRequestFormSchema } from '@/lib/document-request-lookup';
import {
	DOCUMENT_REQUEST_RECORD_TYPE,
	DOCUMENT_REQUEST_STATUS,
} from '@/lib/document-requests/constants';
import {
	assertEncryptedSubmitPayload,
	assertPlatformAdminCannotDecrypt,
	documentRequestToOwnerDetail,
	documentRequestToOwnerListItem,
} from '@/lib/document-requestsCore.mjs';
import { decryptDocumentRequestField } from '@/lib/document-request-wrap-decrypt.mjs';
import { ROLES } from '@/lib/roles';
import {
	cancelDocumentRequest,
	createDocumentRequest,
	listDocumentRequestsForOwner,
	resolveIssuerForDocumentRequest,
} from '@/lib/document-requests';

function normalizeDocumentTypeCode(value = '') {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

async function resolveDocumentTypeForRequest(issuer, { documentTypeId, documentTypeCode }) {
	const tenantId = issuer.tenantId;

	if (documentTypeId) {
		const documentType = await prisma.documentType.findFirst({
			where: {
				id: String(documentTypeId).trim(),
				tenantId,
			},
		});
		if (!documentType) {
			throw new Error('Document type not found for this issuer');
		}
		return documentType;
	}

	const code = String(documentTypeCode || '').trim();
	if (!code) {
		throw new Error('documentTypeId or documentTypeCode is required');
	}

	const byId = await prisma.documentType.findFirst({
		where: { id: code, tenantId },
	});
	if (byId) return byId;

	const documentTypes = await prisma.documentType.findMany({
		where: { tenantId },
	});
	const normalizedCode = normalizeDocumentTypeCode(code);
	const byName = documentTypes.find(
		(documentType) => normalizeDocumentTypeCode(documentType.name) === normalizedCode,
	);
	if (!byName) {
		throw new Error('Document type not found for this issuer');
	}
	return byName;
}

function buildEncryptedFieldsForSubmit({
	body,
	issuer,
	ownerUserId,
	requestId,
}) {
	return body.encryptedFields.map((field) => ({
		...field,
		tenantId: issuer.tenantId,
		ownerUserId,
		recordType: DOCUMENT_REQUEST_RECORD_TYPE,
		recordId: requestId,
	}));
}

async function submitOwnerDocumentRequest(body, auditContext = {}) {
	assertEncryptedSubmitPayload(body);

	const issuer = await resolveIssuerForDocumentRequest(body.issuerId);
	const documentType = await resolveDocumentTypeForRequest(issuer, {
		documentTypeId: body.documentTypeId,
		documentTypeCode: body.documentTypeCode,
	});

	const templateId = body.templateId || body.documentTemplateId || null;
	let documentTemplateId = templateId ? String(templateId).trim() : null;

	if (!documentTemplateId) {
		const schema = await getDocumentRequestFormSchema(issuer.id, documentType.id);
		if (schema.mode === 'template' && schema.documentTemplateId) {
			documentTemplateId = schema.documentTemplateId;
		}
	}

	const requestId = String(body.requestId || body.id || crypto.randomUUID()).trim();
	const ownerUserId = auditContext.ownerUserId;

	if (!ownerUserId) {
		throw new Error('ownerUserId is required');
	}

	const result = await createDocumentRequest(
		{
			id: requestId,
			ownerUserId,
			issuerId: issuer.id,
			tenantId: issuer.tenantId,
			documentTypeId: documentType.id,
			documentTypeLabel: documentType.name,
			documentTemplateId,
			encryptedFields: buildEncryptedFieldsForSubmit({
				body,
				issuer,
				ownerUserId,
				requestId,
			}),
		},
		auditContext,
	);

	return {
		request: documentRequestToOwnerListItem(result.request, issuer.name),
	};
}

async function listOwnerDocumentRequests(ownerUserId) {
	const requests = await listDocumentRequestsForOwner(ownerUserId);
	const issuerIds = [...new Set(requests.map((request) => request.issuerId))];
	const issuers = issuerIds.length
		? await prisma.issuer.findMany({
				where: { id: { in: issuerIds } },
				select: { id: true, name: true },
			})
		: [];
	const issuerNames = new Map(issuers.map((issuer) => [issuer.id, issuer.name]));

	return requests.map((request) =>
		documentRequestToOwnerListItem(request, issuerNames.get(request.issuerId) || ''),
	);
}

function assertOwnerCanReadDenialReason(role) {
	assertPlatformAdminCannotDecrypt(role);
	if (role !== ROLES.DOCUMENT_OWNER) {
		throw new Error('Document owner role required to read denial reason');
	}
}

async function loadOwnerDenialReason(request, role) {
	if (request.status !== DOCUMENT_REQUEST_STATUS.DENIED) {
		return null;
	}

	assertOwnerCanReadDenialReason(role);

	const denialField = await prisma.encryptedPrivateField.findFirst({
		where: {
			tenantId: request.tenantId,
			recordType: DOCUMENT_REQUEST_RECORD_TYPE,
			recordId: request.id,
			fieldKey: 'denial_reason',
		},
	});

	if (!denialField) {
		return null;
	}

	return decryptDocumentRequestField(denialField);
}

async function getOwnerDocumentRequestDetail({
	requestId,
	ownerUserId,
	role = ROLES.DOCUMENT_OWNER,
}) {
	const request = await prisma.documentRequest.findFirst({
		where: {
			id: requestId,
			ownerUserId,
		},
	});

	if (!request) {
		throw new Error('Document request not found');
	}

	const issuer = await prisma.issuer.findFirst({
		where: { id: request.issuerId },
		select: { name: true },
	});

	const denialReason = await loadOwnerDenialReason(request, role);

	return documentRequestToOwnerDetail(
		request,
		issuer?.name || '',
		denialReason,
	);
}

async function cancelOwnerDocumentRequest({
	requestId,
	ownerUserId,
	auditContext = {},
}) {
	const result = await cancelDocumentRequest({
		requestId,
		ownerUserId,
		auditContext,
	});

	const issuer = await prisma.issuer.findFirst({
		where: { id: result.request.issuerId },
		select: { name: true },
	});

	return {
		request: documentRequestToOwnerListItem(result.request, issuer?.name || ''),
	};
}

export {
	assertOwnerCanReadDenialReason,
	cancelOwnerDocumentRequest,
	getOwnerDocumentRequestDetail,
	listOwnerDocumentRequests,
	requireDocumentOwnerContext,
	submitOwnerDocumentRequest,
};
