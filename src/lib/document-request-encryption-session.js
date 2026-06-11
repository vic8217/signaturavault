import { auditEvent } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { hasRecentVerification } from '@/lib/session';
import {
	resolveActiveEncryptionKeyRef,
	resolveIssuerForDocumentRequest,
} from '@/lib/document-requests';
import { DOCUMENT_REQUEST_RECORD_TYPE } from '@/lib/document-requests/constants';
import {
	deriveTenantRequestWrapKey,
	wrapKeyToBase64url,
} from '@/lib/document-request-wrap-key.mjs';

async function ownerHasActiveTrustedDevice(userId) {
	const device = await prisma.trustedDevice.findFirst({
		where: {
			userId,
			isTrusted: true,
			removedAt: null,
		},
		orderBy: { lastUsedAt: 'desc' },
	});
	return Boolean(device);
}

async function createDocumentRequestEncryptionSession({
	issuerId,
	ownerUserId,
	session,
	auditContext = {},
}) {
	if (!ownerUserId) {
		throw new Error('Authentication required');
	}

	const hasTrustedDevice = await ownerHasActiveTrustedDevice(ownerUserId);
	if (!hasTrustedDevice) {
		throw new Error('An active trusted device is required before secure request encryption');
	}

	if (!hasRecentVerification(session)) {
		throw new Error('Recent passkey verification is required before secure request encryption');
	}

	const issuer = await resolveIssuerForDocumentRequest(issuerId);
	const keyRef = await resolveActiveEncryptionKeyRef(issuer.tenantId);
	if (!keyRef) {
		throw new Error('Issuer is not ready for secure document requests');
	}

	const wrapKey = deriveTenantRequestWrapKey(issuer.tenantId, keyRef);
	const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

	await auditEvent({
		tenantId: issuer.tenantId,
		issuerId: issuer.id,
		userId: ownerUserId,
		action: 'document_request_wrap_session_issued',
		target: `issuer:${issuer.id}`,
		details: {
			issuerId: issuer.id,
			keyRef,
			recordType: DOCUMENT_REQUEST_RECORD_TYPE,
			expiresAt: expiresAt.toISOString(),
		},
		ipAddress: auditContext.ipAddress || null,
		device: auditContext.device || null,
	});

	return {
		issuerId: issuer.id,
		tenantId: issuer.tenantId,
		keyRef,
		recordType: DOCUMENT_REQUEST_RECORD_TYPE,
		algorithm: 'AES-256-GCM',
		mode: 'submit_wrap',
		wrapKey: wrapKeyToBase64url(wrapKey),
		expiresAt: expiresAt.toISOString(),
	};
}

export {
	createDocumentRequestEncryptionSession,
	ownerHasActiveTrustedDevice,
};
