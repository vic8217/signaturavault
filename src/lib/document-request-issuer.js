import { prisma } from '@/lib/prisma';
import {
	auditDocumentRequestApproved,
	auditDocumentRequestDenied,
	auditDocumentRequestIssued,
} from '@/lib/document-request-audit';
import { requireIssuerContext } from '@/lib/issuer-templates';
import { normalizeEncryptedPrivateField } from '@/lib/security/encryptedFields';
import {
	DOCUMENT_REQUEST_RECORD_TYPE,
	DOCUMENT_REQUEST_STATUS,
} from '@/lib/document-requests/constants';
import {
	assertIssuerCanApproveRequest,
	assertIssuerCanDenyRequest,
	assertIssuerCanIssueRequest,
	assertIssuerRoleCanReview,
	assertPlatformAdminCannotDecrypt,
	assertSafeDenialReason,
	canTransitionDocumentRequestStatus,
	documentRequestToIssuerListItem,
	documentRequestToIssuerSummary,
} from '@/lib/document-requestsCore.mjs';
import { decryptDocumentRequestField } from '@/lib/document-request-wrap-decrypt.mjs';
import { encryptDocumentRequestField } from '@/lib/document-request-wrap-encrypt.mjs';
import {
	assertDocumentRequestPrivateFieldAccess,
	getDocumentRequestForIssuer,
	listDocumentRequestsForIssuer,
	resolveActiveEncryptionKeyRef,
} from '@/lib/document-requests';
import { issueRequestWithDocumentLinkage } from '@/lib/document-request-issuance';

const ISSUER_DETAIL_FIELD_KEYS = ['purpose', 'privateReference', 'notes', 'denial_reason'];

async function requireIssuerRequestContext() {
	const context = await requireIssuerContext({ allowStaff: true });
	if (context.error) return context;

	assertIssuerRoleCanReview(context.role);

	return context;
}

function auditContextFromActor(context, auditContext = {}) {
	return {
		actorUserId: context.session.userId,
		ipAddress: auditContext.ipAddress || null,
		device: auditContext.device || null,
	};
}

async function loadOwnerDisplayLabels(ownerUserIds = []) {
	const uniqueIds = [...new Set(ownerUserIds.filter(Boolean))];
	if (!uniqueIds.length) return new Map();

	const owners = await prisma.user.findMany({
		where: { id: { in: uniqueIds } },
		select: { id: true, signaturaId: true },
	});

	return new Map(
		owners.map((owner) => [
			owner.id,
			String(owner.signaturaId || '').trim() || 'Owner',
		]),
	);
}

async function listIssuerDocumentRequests(tenantId, { status } = {}) {
	const requests = await listDocumentRequestsForIssuer(tenantId, { status });
	const ownerLabels = await loadOwnerDisplayLabels(
		requests.map((request) => request.ownerUserId),
	);

	return requests.map((request) =>
		documentRequestToIssuerListItem(
			{ id: request.id, ...request },
			ownerLabels.get(request.ownerUserId) || 'Owner',
		),
	);
}

async function loadEncryptedRequestFields(requestId, tenantId) {
	return prisma.encryptedPrivateField.findMany({
		where: {
			tenantId,
			recordType: DOCUMENT_REQUEST_RECORD_TYPE,
			recordId: requestId,
		},
		orderBy: { fieldKey: 'asc' },
	});
}

function decryptRequestFieldsForIssuer(fields = []) {
	const decrypted = {};

	for (const field of fields) {
		try {
			decrypted[field.fieldKey] = decryptDocumentRequestField(field);
		} catch {
			decrypted[field.fieldKey] = null;
		}
	}

	return decrypted;
}

async function getIssuerDocumentRequestDetail({
	requestId,
	tenantId,
	role,
}) {
	assertDocumentRequestPrivateFieldAccess(role);
	assertIssuerRoleCanReview(role);

	const request = await getDocumentRequestForIssuer({ requestId, tenantId });
	const ownerLabels = await loadOwnerDisplayLabels([request.ownerUserId]);
	const encryptedFields = await loadEncryptedRequestFields(requestId, tenantId);
	const privateFields = decryptRequestFieldsForIssuer(encryptedFields);

	const detail = {
		...documentRequestToIssuerListItem(
			{ id: request.id, ...request },
			ownerLabels.get(request.ownerUserId) || 'Owner',
		),
		documentTypeId: request.documentTypeId,
		documentTemplateId: request.documentTemplateId || null,
		reviewedAt: request.reviewedAt || null,
		issuedAt: request.issuedAt || null,
		cancelledAt: request.cancelledAt || null,
		issuedDocumentRecordId: request.issuedDocumentRecordId || null,
		walletDelivered: Boolean(request.walletDelivered),
		privateFields: {
			purpose: privateFields.purpose ?? null,
			privateReference: privateFields.privateReference ?? null,
			notes: privateFields.notes ?? null,
			denialReason: privateFields.denial_reason ?? null,
		},
	};

	for (const key of ISSUER_DETAIL_FIELD_KEYS) {
		if (Object.hasOwn(detail, key)) {
			throw new Error(`Issuer detail leaked encrypted field key: ${key}`);
		}
	}

	return detail;
}

async function assertIssuerRequestTransition(request, toStatus) {
	if (!canTransitionDocumentRequestStatus(request.status, toStatus)) {
		throw new Error(
			`Document request cannot transition from ${request.status} to ${toStatus}`,
		);
	}
}

async function approveIssuerDocumentRequest({
	requestId,
	tenantId,
	actorUserId,
	auditContext = {},
}) {
	const request = await prisma.documentRequest.findFirst({
		where: { id: requestId, tenantId },
	});

	if (!request) {
		throw new Error('Document request not found');
	}

	assertIssuerCanApproveRequest(request.status);
	await assertIssuerRequestTransition(request, DOCUMENT_REQUEST_STATUS.APPROVED);

	const updated = await prisma.documentRequest.update({
		where: { id: request.id },
		data: {
			status: DOCUMENT_REQUEST_STATUS.APPROVED,
			reviewedAt: new Date(),
			reviewedByUserId: actorUserId,
		},
	});

	await auditDocumentRequestApproved(updated, {
		...auditContext,
		actorUserId,
	});

	return {
		request: documentRequestToIssuerSummary(updated),
	};
}

async function denyIssuerDocumentRequest({
	requestId,
	tenantId,
	actorUserId,
	denialReason,
	auditContext = {},
}) {
	const normalizedReason = assertSafeDenialReason(denialReason);

	const request = await prisma.documentRequest.findFirst({
		where: { id: requestId, tenantId },
	});

	if (!request) {
		throw new Error('Document request not found');
	}

	assertIssuerCanDenyRequest(request.status);
	await assertIssuerRequestTransition(request, DOCUMENT_REQUEST_STATUS.DENIED);

	const keyRef = await resolveActiveEncryptionKeyRef(tenantId);
	if (!keyRef) {
		throw new Error('Issuer encryption key is not configured');
	}

	const encryptedDenial = encryptDocumentRequestField({
		tenantId,
		recordType: DOCUMENT_REQUEST_RECORD_TYPE,
		recordId: request.id,
		fieldKey: 'denial_reason',
		keyRef,
		plaintext: normalizedReason,
	});
	const normalizedDenialField = normalizeEncryptedPrivateField({
		...encryptedDenial,
		ownerUserId: request.ownerUserId,
	});

	const updated = await prisma.$transaction(async (tx) => {
		const denied = await tx.documentRequest.update({
			where: { id: request.id },
			data: {
				status: DOCUMENT_REQUEST_STATUS.DENIED,
				reviewedAt: new Date(),
				reviewedByUserId: actorUserId,
			},
		});

		const existing = await tx.encryptedPrivateField.findFirst({
			where: {
				tenantId,
				recordType: DOCUMENT_REQUEST_RECORD_TYPE,
				recordId: request.id,
				fieldKey: 'denial_reason',
			},
		});

		if (existing) {
			await tx.encryptedPrivateField.update({
				where: {
					tenantId_recordType_recordId_fieldKey: {
						tenantId,
						recordType: DOCUMENT_REQUEST_RECORD_TYPE,
						recordId: request.id,
						fieldKey: 'denial_reason',
					},
				},
				data: normalizedDenialField,
			});
		} else {
			await tx.encryptedPrivateField.create({
				data: normalizedDenialField,
			});
		}

		return denied;
	});

	await auditDocumentRequestDenied(updated, {
		...auditContext,
		actorUserId,
	});

	return {
		request: documentRequestToIssuerSummary(updated),
	};
}

async function issueIssuerDocumentRequest({
	requestId,
	tenantId,
	actorUserId,
	documentRecordId,
	documentHash,
	walletDeliveryAvailable = false,
	auditContext = {},
}) {
	const request = await prisma.documentRequest.findFirst({
		where: { id: requestId, tenantId },
	});

	if (!request) {
		throw new Error('Document request not found');
	}

	assertIssuerCanIssueRequest(request.status);
	await assertIssuerRequestTransition(request, DOCUMENT_REQUEST_STATUS.ISSUED);

	const result = await issueRequestWithDocumentLinkage({
		request,
		documentRecordId,
		documentHash,
		walletDeliveryAvailable,
		actorUserId,
	});

	const updated = result.request;

	await auditDocumentRequestIssued(updated, {
		...auditContext,
		actorUserId,
		issuedDocumentRecordId: updated.issuedDocumentRecordId || null,
		walletDelivered: result.walletDelivered,
		deliveryStatus: result.issuedDocument?.deliveryStatus || null,
		linkageType: result.issuedDocument?.linkageType || null,
		documentId: result.issuedDocument?.documentId || null,
	});

	return {
		request: documentRequestToIssuerSummary(updated),
		requestId: result.requestId,
		documentId: result.documentId,
		deliveryStatus: result.deliveryStatus,
		walletDeliveryAvailable: result.walletDeliveryAvailable,
		linkageStatus: result.linkageStatus,
		issuedDocument: result.issuedDocument,
	};
}

function assertRoleCanDecryptIssuerRequestDetail(role) {
	assertPlatformAdminCannotDecrypt(role);
	assertIssuerRoleCanReview(role);
}

export {
	approveIssuerDocumentRequest,
	assertRoleCanDecryptIssuerRequestDetail,
	auditContextFromActor,
	denyIssuerDocumentRequest,
	getIssuerDocumentRequestDetail,
	issueIssuerDocumentRequest,
	listIssuerDocumentRequests,
	requireIssuerRequestContext,
};
