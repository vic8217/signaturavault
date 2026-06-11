import { prisma } from '@/lib/prisma';

async function resolveValidatedIssuedDocumentRecordId({
	documentRecordId,
	tenantId,
	issuerId,
}) {
	const normalized = String(documentRecordId || '').trim();
	if (!normalized) return null;

	const record = await prisma.documentRecord.findFirst({
		where: {
			id: normalized,
			tenantId,
			...(issuerId ? { issuerId } : {}),
		},
		select: { id: true },
	});

	if (!record) {
		throw new Error('Document record not found for this issuer tenant');
	}

	return record.id;
}

export { resolveValidatedIssuedDocumentRecordId };
