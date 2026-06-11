import Link from 'next/link';
import { notFound } from 'next/navigation';
import { WalletIssuerDocuments } from '@/components/WalletIssuerDocuments';
import { getRegisteredIssuerById } from '@/lib/issuer-registry';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function templateToWalletItem(template) {
	return {
		id: template.id,
		name: template.name,
		documentType: template.documentType,
		version: template.version,
		publishedAt: template.publishedAt?.toISOString() || null,
		updatedAt: template.updatedAt?.toISOString() || null,
		fieldCount: template.templateFields?.length || 0,
	};
}

export default async function WalletIssuerDocumentsPage({ params }) {
	const { issuerId } = await params;
	const issuer = await getRegisteredIssuerById(issuerId);

	if (!issuer) notFound();

	const templates = await prisma.documentTemplate.findMany({
		where: {
			status: 'published',
			OR: [
				{ tenantId: issuer.tenant_id },
				{ issuerId: issuer.id },
			],
		},
		include: {
			templateFields: { orderBy: { sortOrder: 'asc' } },
		},
		orderBy: { updatedAt: 'desc' },
	});

	return (
		<div className="space-y-6">
			<Link
				href="/signatura/documents/issuers"
				className="inline-flex rounded-lg border border-white/10 px-4 py-2 text-sm font-bold text-white transition hover:border-red-400 hover:text-red-200">
				Back to issuers
			</Link>
			<WalletIssuerDocuments
				issuer={issuer}
				templates={templates.map(templateToWalletItem)}
			/>
		</div>
	);
}
