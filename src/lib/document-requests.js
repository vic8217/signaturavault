import crypto from 'crypto';
import { loadDb } from '@/lib/db';
import { prisma } from '@/lib/prisma';
import { normalizeEncryptedPrivateField } from '@/lib/security/encryptedFields';
import {
	ACTIVE_DOCUMENT_REQUEST_STATUSES,
	DOCUMENT_REQUEST_RECORD_TYPE,
	DOCUMENT_REQUEST_STATUS,
} from '@/lib/document-requests/constants';
import {
	assertNoActiveDocumentRequest,
	assertOwnerCanCancelRequest,
	assertPlatformAdminCannotDecrypt,
	assertPlatformAdminSummaryOnly,
	buildWorkflowReferenceCode,
	documentRequestToAdminSummary,
	documentRequestToIssuerSummary,
	documentRequestToOwnerSummary,
	validateCreateDocumentRequestInput,
	validateFallbackEncryptedFieldKeys,
} from '@/lib/document-requestsCore.mjs';
import {
	auditDocumentRequestCancelled,
	auditDocumentRequestSubmitted,
} from '@/lib/document-request-audit';

async function warnIfDevRegistryEmpty() {
	try {
		const db = await loadDb();
		if (!Array.isArray(db.issuers) || db.issuers.length === 0) {
			console.warn(
				'[document-requests] Dev JSON issuer registry is empty; using Prisma as source of truth.',
			);
		}
	} catch {
		// Non-blocking: Prisma remains authoritative.
	}
}

async function resolveIssuerForDocumentRequest(issuerId) {
	await warnIfDevRegistryEmpty();

	const issuer = await prisma.issuer.findFirst({
		where: {
			id: issuerId,
			status: 'active',
			acceptsRequests: true,
		},
	});

	if (!issuer) {
		throw new Error('Issuer is not available for document requests');
	}

	return issuer;
}

async function findActiveDocumentRequest({
	ownerUserId,
	issuerId,
	documentTypeId,
}) {
	return prisma.documentRequest.findFirst({
		where: {
			ownerUserId,
			issuerId,
			documentTypeId,
			status: { in: ACTIVE_DOCUMENT_REQUEST_STATUSES },
		},
		orderBy: { submittedAt: 'desc' },
	});
}

function normalizeRequestEncryptedFields({
	requestId,
	ownerUserId,
	tenantId,
	encryptedFields,
}) {
	return encryptedFields.map((field) =>
		normalizeEncryptedPrivateField({
			...field,
			tenantId,
			ownerUserId,
			recordType: DOCUMENT_REQUEST_RECORD_TYPE,
			recordId: requestId,
		}),
	);
}

async function createDocumentRequest(input, auditContext = {}) {
	validateCreateDocumentRequestInput(input);

	const issuer = await resolveIssuerForDocumentRequest(input.issuerId);
	if (issuer.tenantId !== input.tenantId) {
		throw new Error('tenantId does not match issuer tenant');
	}

	const activeRequest = await findActiveDocumentRequest({
		ownerUserId: input.ownerUserId,
		issuerId: input.issuerId,
		documentTypeId: input.documentTypeId,
	});
	assertNoActiveDocumentRequest(activeRequest);

	if (!input.documentTemplateId) {
		validateFallbackEncryptedFieldKeys(
			input.encryptedFields.map((field) => field.fieldKey),
		);
	}

	const requestId = input.id || crypto.randomUUID();
	const referenceCode = input.referenceCode || buildWorkflowReferenceCode();
	const normalizedFields = normalizeRequestEncryptedFields({
		requestId,
		ownerUserId: input.ownerUserId,
		tenantId: input.tenantId,
		encryptedFields: input.encryptedFields,
	});

	const request = await prisma.$transaction(async (tx) => {
		const created = await tx.documentRequest.create({
			data: {
				id: requestId,
				tenantId: input.tenantId,
				issuerId: input.issuerId,
				ownerUserId: input.ownerUserId,
				documentTypeId: input.documentTypeId,
				documentTypeLabel: input.documentTypeLabel || null,
				documentTemplateId: input.documentTemplateId || null,
				status: DOCUMENT_REQUEST_STATUS.PENDING,
				referenceCode,
			},
		});

		for (const field of normalizedFields) {
			await tx.encryptedPrivateField.create({
				data: field,
			});
		}

		return created;
	});

	await auditDocumentRequestSubmitted(request, auditContext);

	return {
		request: documentRequestToOwnerSummary(request),
	};
}

async function cancelDocumentRequest({
	requestId,
	ownerUserId,
	auditContext = {},
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

	assertOwnerCanCancelRequest(request.status);

	const updated = await prisma.documentRequest.update({
		where: { id: request.id },
		data: {
			status: DOCUMENT_REQUEST_STATUS.CANCELLED,
			cancelledAt: new Date(),
		},
	});

	await auditDocumentRequestCancelled(updated, {
		...auditContext,
		actorUserId: ownerUserId,
	});

	return {
		request: documentRequestToOwnerSummary(updated),
	};
}

async function getDocumentRequestForOwner({ requestId, ownerUserId }) {
	const request = await prisma.documentRequest.findFirst({
		where: {
			id: requestId,
			ownerUserId,
		},
	});

	if (!request) {
		throw new Error('Document request not found');
	}

	return documentRequestToOwnerSummary(request);
}

async function getDocumentRequestForIssuer({ requestId, tenantId }) {
	const request = await prisma.documentRequest.findFirst({
		where: {
			id: requestId,
			tenantId,
		},
	});

	if (!request) {
		throw new Error('Document request not found');
	}

	return documentRequestToIssuerSummary(request);
}

async function listDocumentRequestsForOwner(ownerUserId) {
	const requests = await prisma.documentRequest.findMany({
		where: { ownerUserId },
		orderBy: { submittedAt: 'desc' },
	});

	return requests.map(documentRequestToOwnerSummary);
}

async function listDocumentRequestsForIssuer(tenantId, { status } = {}) {
	const requests = await prisma.documentRequest.findMany({
		where: {
			tenantId,
			...(status ? { status } : {}),
		},
		orderBy: { submittedAt: 'desc' },
	});

	return requests.map(documentRequestToIssuerSummary);
}

async function getAdminDocumentRequestSummary(role) {
	assertPlatformAdminSummaryOnly(role);

	const grouped = await prisma.documentRequest.groupBy({
		by: ['status', 'issuerId', 'documentTypeLabel'],
		_count: { _all: true },
	});

	const issuerIds = [...new Set(grouped.map((row) => row.issuerId))];
	const issuers = issuerIds.length
		? await prisma.issuer.findMany({
				where: { id: { in: issuerIds } },
				select: { id: true, name: true },
			})
		: [];
	const issuerNames = new Map(issuers.map((issuer) => [issuer.id, issuer.name]));

	return {
		totalCount: grouped.reduce((sum, row) => sum + row._count._all, 0),
		byStatus: grouped.map((row) => ({
			status: row.status,
			issuerName: issuerNames.get(row.issuerId) || '',
			documentTypeLabel: row.documentTypeLabel || null,
			count: row._count._all,
		})),
	};
}

function assertDocumentRequestPrivateFieldAccess(role) {
	assertPlatformAdminCannotDecrypt(role);
}

async function resolveActiveEncryptionKeyRef(tenantId) {
	const keyReference = await prisma.privateFieldKeyReference.findFirst({
		where: {
			tenantId,
			status: 'active',
		},
		orderBy: { createdAt: 'desc' },
		select: { keyRef: true },
	});
	return keyReference?.keyRef || null;
}

async function getOwnerDocumentRequestEncryptionConfig(tenantId) {
	const keyRef = await resolveActiveEncryptionKeyRef(tenantId);
	return {
		keyRef,
		recordType: DOCUMENT_REQUEST_RECORD_TYPE,
		mode: 'submit_wrap',
		ready: Boolean(keyRef),
		requiresTrustedDevice: true,
	};
}

export {
	assertDocumentRequestPrivateFieldAccess,
	cancelDocumentRequest,
	createDocumentRequest,
	findActiveDocumentRequest,
	getAdminDocumentRequestSummary,
	getDocumentRequestForIssuer,
	getDocumentRequestForOwner,
	getOwnerDocumentRequestEncryptionConfig,
	listDocumentRequestsForIssuer,
	listDocumentRequestsForOwner,
	resolveActiveEncryptionKeyRef,
	resolveIssuerForDocumentRequest,
	warnIfDevRegistryEmpty,
};
