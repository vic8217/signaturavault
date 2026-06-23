#!/usr/bin/env node
/**
 * Repairs ACCURA app links that still point at SIG-U-* instead of SIG-ACCURA-* role IDs.
 *
 * Usage:
 *   node scripts/repair-accura-role-signatura-ids.mjs
 *   node scripts/repair-accura-role-signatura-ids.mjs --signatura-id SIG-U-E990-03BF
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { createUniqueAccuraSignaturaId } from '../src/lib/identity.js';

const adapter = new PrismaPg(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

const targetId = String(
	process.argv.find((arg) => arg.startsWith('--signatura-id='))?.split('=')[1] ||
		process.argv[process.argv.indexOf('--signatura-id') + 1] ||
		'',
)
	.trim()
	.toUpperCase();

async function main() {
	const links = await prisma.signaturaAppLink.findMany({
		where: {
			sourceApp: 'ACCURA',
			status: 'ACTIVE',
			...(targetId ? { signaturaId: targetId } : {}),
		},
		include: { user: { select: { signaturaId: true } } },
	});

	const broken = links.filter((link) => !String(link.signaturaId || '').startsWith('SIG-ACCURA-'));
	if (!broken.length) {
		console.log('No ACCURA app links need repair.');
		return;
	}

	for (const link of broken) {
		const masterSignaturaId = link.user?.signaturaId || link.signaturaId;
		const roleSignaturaId = await createUniqueAccuraSignaturaId(
			prisma,
			link.companyCode || 'ACCURA',
			link.rolePrefix || 'SADM',
		);
		const registrationContext =
			link.registrationContext && typeof link.registrationContext === 'object'
				? { ...link.registrationContext, masterSignaturaId }
				: { masterSignaturaId };

		await prisma.signaturaAppLink.update({
			where: { id: link.id },
			data: {
				signaturaId: roleSignaturaId,
				registrationContext,
			},
		});

		console.log(
			`Repaired ${link.rolePrefix || 'role'} link: ${masterSignaturaId} -> ${roleSignaturaId}`,
		);
	}
}

main()
	.catch((error) => {
		console.error(error.message || error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
