import crypto from 'crypto';

import { createDocumentRecordWithClient } from '@/lib/document-records';
import { prisma } from '@/lib/prisma';
import {
	DOCUMENT_REQUEST_STATUS,
	ISSUED_DOCUMENT_DELIVERY_STATUS,
	ISSUED_DOCUMENT_LINKAGE_STATUS,
	ISSUED_DOCUMENT_LINKAGE_TYPE,
} from '@/lib/document-requests/constants';
import { resolveValidatedIssuedDocumentRecordId } from '@/lib/document-request-record-validation';

function hasDocumentInput({ documentRecordId, documentHash }) {
	return (
		Boolean(String(documentRecordId || '').trim()) ||
		Boolean(String(documentHash || '').trim())
	);
}

async function assertDocumentRecordAvailableForRequest(tx, recordId, request) {
	const record = await tx.documentRecord.findFirst({
		where: {
			id: recordId,
			tenantId: request.tenantId,
			issuerId: request.issuerId,
		},
		select: {
			id: true,
			documentRequestId: true,
			ownerUserId: true,
		},
	});

	if (!record) {
		throw new Error('Document record not found for this issuer tenant');
	}

	if (record.documentRequestId && record.documentRequestId !== request.id) {
		throw new Error('Document record is already linked to another request');
	}

	if (record.ownerUserId && record.ownerUserId !== request.ownerUserId) {
		throw new Error('Document record belongs to a different owner');
	}

	return record;
}

async function bindDocumentRecordToRequest(tx, recordId, request) {
	await assertDocumentRecordAvailableForRequest(tx, recordId, request);

	await tx.documentRecord.update({
		where: { id: recordId },
		data: {
			ownerUserId: request.ownerUserId,
			documentRequestId: request.id,
			documentTypeLabel: request.documentTypeLabel || null,
		},
	});

	return recordId;
}

function resolveWalletDelivered({
	walletDeliveryRequested,
	documentRecordId,
	ownerUserId,
	requestOwnerUserId,
}) {
	if (!walletDeliveryRequested || !documentRecordId) {
		return false;
	}

	return String(ownerUserId || '').trim() === String(requestOwnerUserId || '').trim();
}

function buildIssueResponse({
	request,
	documentId = null,
	deliveryStatus = ISSUED_DOCUMENT_DELIVERY_STATUS.ISSUER_RELEASE,
	linkageStatus = ISSUED_DOCUMENT_LINKAGE_STATUS.NONE,
	walletDelivered = false,
	linkageType = null,
}) {
	return {
		request,
		requestId: request.id,
		documentId,
		deliveryStatus,
		walletDeliveryAvailable: walletDelivered,
		linkageStatus,
		issuedDocument: documentId
			? {
					requestId: request.id,
					documentId,
					deliveryStatus,
					linkageType,
				}
			: null,
		walletDelivered,
	};
}

async function issueRequestWithDocumentLinkage({
	request,
	documentRecordId,
	documentHash,
	walletDeliveryAvailable = false,
	actorUserId,
}) {
	const walletDeliveryRequested = Boolean(walletDeliveryAvailable);
	const documentInputProvided = hasDocumentInput({ documentRecordId, documentHash });
	const normalizedRecordId = String(documentRecordId || '').trim();
	const normalizedHash = String(documentHash || '').trim();

	if (walletDeliveryRequested && !documentInputProvided) {
		throw new Error('Wallet delivery requires a document record or document hash');
	}

	if (normalizedRecordId && normalizedHash) {
		throw new Error('Provide either documentRecordId or documentHash, not both');
	}

	if (normalizedRecordId) {
		await resolveValidatedIssuedDocumentRecordId({
			documentRecordId: normalizedRecordId,
			tenantId: request.tenantId,
			issuerId: request.issuerId,
		});
	}

	const issuedAt = new Date();

	const transactionResult = await prisma.$transaction(async (tx) => {
		let resolvedDocumentRecordId = null;
		let linkageType = null;

		if (normalizedHash) {
			const created = await createDocumentRecordWithClient(tx, {
				tenantId: request.tenantId,
				issuerId: request.issuerId,
				documentHash: normalizedHash,
				documentTemplateId: request.documentTemplateId || null,
				ownerUserId: request.ownerUserId,
				documentRequestId: request.id,
				documentTypeLabel: request.documentTypeLabel || null,
			});
			resolvedDocumentRecordId = created.documentId;
			linkageType = ISSUED_DOCUMENT_LINKAGE_TYPE.CREATED;
		} else if (normalizedRecordId) {
			await bindDocumentRecordToRequest(tx, normalizedRecordId, request);
			resolvedDocumentRecordId = normalizedRecordId;
			linkageType = ISSUED_DOCUMENT_LINKAGE_TYPE.LINKED;
		}

		const walletDelivered = resolveWalletDelivered({
			walletDeliveryRequested,
			documentRecordId: resolvedDocumentRecordId,
			ownerUserId: request.ownerUserId,
			requestOwnerUserId: request.ownerUserId,
		});

		const deliveryStatus = walletDelivered
			? ISSUED_DOCUMENT_DELIVERY_STATUS.WALLET_DELIVERED
			: ISSUED_DOCUMENT_DELIVERY_STATUS.ISSUER_RELEASE;

		const issuedRequest = await tx.documentRequest.update({
			where: { id: request.id },
			data: {
				status: DOCUMENT_REQUEST_STATUS.ISSUED,
				issuedAt,
				reviewedByUserId: actorUserId,
				reviewedAt: request.reviewedAt || issuedAt,
				issuedDocumentRecordId: resolvedDocumentRecordId,
				walletDelivered,
			},
		});

		if (resolvedDocumentRecordId) {
			await tx.issuedDocument.create({
				data: {
					id: crypto.randomUUID(),
					tenantId: request.tenantId,
					requestId: request.id,
					documentId: resolvedDocumentRecordId,
					issuerId: request.issuerId,
					ownerId: request.ownerUserId,
					issuedAt,
					deliveryStatus,
					linkageType,
					createdByUserId: actorUserId,
				},
			});
		}

		return {
			issuedRequest,
			documentId: resolvedDocumentRecordId,
			deliveryStatus,
			linkageStatus: linkageType || ISSUED_DOCUMENT_LINKAGE_STATUS.NONE,
			linkageType,
			walletDelivered,
		};
	});

	return buildIssueResponse({
		request: transactionResult.issuedRequest,
		documentId: transactionResult.documentId,
		deliveryStatus: transactionResult.deliveryStatus,
		linkageStatus: transactionResult.linkageStatus,
		walletDelivered: transactionResult.walletDelivered,
		linkageType: transactionResult.linkageType,
	});
}

export {
	buildIssueResponse,
	hasDocumentInput,
	issueRequestWithDocumentLinkage,
	resolveWalletDelivered,
};
