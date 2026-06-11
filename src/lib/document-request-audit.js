import { auditEvent } from '@/lib/audit';
import {
	DOCUMENT_REQUEST_AUDIT_ACTIONS,
} from '@/lib/document-requests/constants';
import { buildDocumentRequestAuditDetails } from '@/lib/document-requestsCore.mjs';

async function auditDocumentRequestSubmitted(request, context = {}) {
	return auditEvent({
		tenantId: request.tenantId,
		issuerId: request.issuerId,
		userId: request.ownerUserId,
		action: DOCUMENT_REQUEST_AUDIT_ACTIONS.SUBMITTED,
		target: `document_request:${request.id}`,
		details: buildDocumentRequestAuditDetails(request, {
			documentTemplateId: request.documentTemplateId || null,
		}),
		ipAddress: context.ipAddress || null,
		device: context.device || null,
	});
}

async function auditDocumentRequestCancelled(request, context = {}) {
	return auditEvent({
		tenantId: request.tenantId,
		issuerId: request.issuerId,
		userId: context.actorUserId || request.ownerUserId,
		action: DOCUMENT_REQUEST_AUDIT_ACTIONS.CANCELLED,
		target: `document_request:${request.id}`,
		details: buildDocumentRequestAuditDetails(request, {
			previousStatus: 'pending',
		}),
		ipAddress: context.ipAddress || null,
		device: context.device || null,
	});
}

async function auditDocumentRequestApproved(request, context = {}) {
	return auditEvent({
		tenantId: request.tenantId,
		issuerId: request.issuerId,
		userId: context.actorUserId || null,
		action: DOCUMENT_REQUEST_AUDIT_ACTIONS.APPROVED,
		target: `document_request:${request.id}`,
		details: buildDocumentRequestAuditDetails(request, {
			documentTemplateId: context.documentTemplateId || request.documentTemplateId || null,
		}),
		ipAddress: context.ipAddress || null,
		device: context.device || null,
	});
}

async function auditDocumentRequestDenied(request, context = {}) {
	return auditEvent({
		tenantId: request.tenantId,
		issuerId: request.issuerId,
		userId: context.actorUserId || null,
		action: DOCUMENT_REQUEST_AUDIT_ACTIONS.DENIED,
		target: `document_request:${request.id}`,
		details: buildDocumentRequestAuditDetails(request),
		ipAddress: context.ipAddress || null,
		device: context.device || null,
	});
}

async function auditDocumentRequestIssued(request, context = {}) {
	return auditEvent({
		tenantId: request.tenantId,
		issuerId: request.issuerId,
		userId: context.actorUserId || null,
		action: DOCUMENT_REQUEST_AUDIT_ACTIONS.ISSUED,
		target: `document_request:${request.id}`,
		details: buildDocumentRequestAuditDetails(request, {
			issuedDocumentRecordId: context.issuedDocumentRecordId || request.issuedDocumentRecordId || null,
			walletDelivered: Boolean(context.walletDelivered ?? request.walletDelivered),
			deliveryStatus: context.deliveryStatus || null,
			linkageType: context.linkageType || null,
			documentId: context.documentId || context.issuedDocumentRecordId || request.issuedDocumentRecordId || null,
		}),
		ipAddress: context.ipAddress || null,
		device: context.device || null,
	});
}

async function auditDocumentRequestAccessDenied(request, context = {}) {
	return auditEvent({
		tenantId: request?.tenantId || context.tenantId || 'unknown',
		issuerId: request?.issuerId || context.issuerId || null,
		userId: context.actorUserId || null,
		action: DOCUMENT_REQUEST_AUDIT_ACTIONS.ACCESS_DENIED,
		target: request?.id ? `document_request:${request.id}` : 'document_request',
		details: {
			requestId: request?.id || null,
			reason: context.reason || 'access_denied',
		},
		result: 'denied',
		ipAddress: context.ipAddress || null,
		device: context.device || null,
	});
}

export {
	auditDocumentRequestAccessDenied,
	auditDocumentRequestApproved,
	auditDocumentRequestCancelled,
	auditDocumentRequestDenied,
	auditDocumentRequestIssued,
	auditDocumentRequestSubmitted,
};
