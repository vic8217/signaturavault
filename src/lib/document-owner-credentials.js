import { prisma } from '@/lib/prisma';
import { requireDocumentOwnerContext } from '@/lib/document-request-lookup';
import {
	ISSUED_DOCUMENT_DELIVERY_STATUS,
} from '@/lib/document-requests/constants';

const OWNER_CREDENTIAL_FIELDS = [
	'documentId',
	'documentTypeLabel',
	'issuerName',
	'issuedAt',
	'verificationStatus',
	'anchorStatus',
	'verifyUrl',
	'qrVerifyUrl',
];

function documentToOwnerCredentialSummary({
	documentRecord,
	issuerName,
	issuedLink,
}) {
	const summary = {
		documentId: documentRecord.id,
		documentTypeLabel: documentRecord.documentTypeLabel || 'Document',
		issuerName: issuerName || '',
		issuedAt: issuedLink?.issuedAt || documentRecord.issuedAt,
		verificationStatus: documentRecord.status || 'valid',
		anchorStatus: documentRecord.anchorStatus || 'pending',
		verifyUrl: `/verify?token=${encodeURIComponent(documentRecord.verificationToken)}`,
		qrVerifyUrl: `/verify?token=${encodeURIComponent(documentRecord.qrToken)}`,
	};

	for (const key of Object.keys(summary)) {
		if (!OWNER_CREDENTIAL_FIELDS.includes(key)) {
			throw new Error(`Owner credential summary includes disallowed field: ${key}`);
		}
	}

	const forbidden = [
		'hash',
		'documentHash',
		'recipientName',
		'externalId',
		'metadata',
		'purpose',
		'notes',
		'privateReference',
		'ownerUserId',
		'tenantId',
	];
	for (const key of forbidden) {
		if (Object.hasOwn(summary, key)) {
			throw new Error(`Owner credential summary leaked private field: ${key}`);
		}
	}

	return summary;
}

async function listOwnerDocumentCredentials(ownerUserId) {
	const issuedLinks = await prisma.issuedDocument.findMany({
		where: {
			ownerId: ownerUserId,
			deliveryStatus: ISSUED_DOCUMENT_DELIVERY_STATUS.WALLET_DELIVERED,
		},
		orderBy: { issuedAt: 'desc' },
	});

	if (!issuedLinks.length) {
		return [];
	}

	const documentIds = issuedLinks.map((link) => link.documentId);
	const issuerIds = [...new Set(issuedLinks.map((link) => link.issuerId))];

	const [documents, issuers] = await Promise.all([
		prisma.documentRecord.findMany({
			where: {
				id: { in: documentIds },
				ownerUserId: ownerUserId,
			},
		}),
		prisma.issuer.findMany({
			where: { id: { in: issuerIds } },
			select: { id: true, name: true },
		}),
	]);

	const documentById = new Map(documents.map((document) => [document.id, document]));
	const issuerNameById = new Map(issuers.map((issuer) => [issuer.id, issuer.name]));

	return issuedLinks
		.map((link) => {
			const documentRecord = documentById.get(link.documentId);
			if (!documentRecord) return null;
			if (documentRecord.ownerUserId !== ownerUserId) return null;

			return documentToOwnerCredentialSummary({
				documentRecord,
				issuerName: issuerNameById.get(link.issuerId) || '',
				issuedLink: link,
			});
		})
		.filter(Boolean);
}

export {
	documentToOwnerCredentialSummary,
	listOwnerDocumentCredentials,
	requireDocumentOwnerContext,
};
