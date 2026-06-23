import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	createUniqueAccuraSignaturaId,
	normalizeSignaturaId,
} from '@/lib/identity';
import { normalizeAccuraRole, normalizeAccuraRolePrefix } from '@/lib/registrationSource';

export async function POST(req) {
	try {
		const body = await req.json().catch(() => ({}));
		const masterSignaturaId = normalizeSignaturaId(
			body.masterSignaturaId || body.signaturaId || '',
		);
		const rolePrefix = normalizeAccuraRolePrefix(body.rolePrefix || 'SADM');
		const companyCode = String(body.companyCode || 'ACCURA').trim().toUpperCase();

		if (!masterSignaturaId) {
			return jsonError('Signatura ID is required', 400);
		}
		if (!rolePrefix) {
			return jsonError('ACCURA role prefix is required', 400);
		}

		if (masterSignaturaId.startsWith('SIG-ACCURA-')) {
			return Response.json({
				ok: true,
				masterSignaturaId,
				roleSignaturaId: masterSignaturaId,
				rolePrefix,
				repaired: false,
			});
		}

		const user = await prisma.user.findUnique({
			where: { signaturaId: masterSignaturaId },
			select: { id: true, signaturaId: true },
		});
		if (!user) {
			return jsonError('Signatura identity not found', 404);
		}

		let link = await prisma.signaturaAppLink.findFirst({
			where: {
				userId: user.id,
				sourceApp: 'ACCURA',
				rolePrefix,
				status: 'ACTIVE',
				...(rolePrefix === 'SADM' ? {} : { companyCode }),
			},
			orderBy: { createdAt: 'desc' },
		});

		let repaired = false;
		let roleSignaturaId = String(link?.signaturaId || '').trim().toUpperCase();

		if (!roleSignaturaId.startsWith('SIG-ACCURA-')) {
			roleSignaturaId = await createUniqueAccuraSignaturaId(
				prisma,
				rolePrefix === 'SADM' ? companyCode : link?.companyCode || companyCode,
				rolePrefix,
			);
			repaired = true;
		}

		const registrationContext =
			link?.registrationContext && typeof link.registrationContext === 'object'
				? { ...link.registrationContext, masterSignaturaId: user.signaturaId }
				: { masterSignaturaId: user.signaturaId };
		const normalizedRole = rolePrefix === 'SADM' ? 'system_admin' : link?.role || null;
		const needsRoleRepair =
			link &&
			(!link.role || normalizeAccuraRole(link.role) !== normalizedRole);

		if (link && (repaired || needsRoleRepair || link.signaturaId !== roleSignaturaId)) {
			link = await prisma.signaturaAppLink.update({
				where: { id: link.id },
				data: {
					signaturaId: roleSignaturaId,
					role: normalizedRole,
					registrationContext,
				},
			});
			repaired = true;
		} else if (!link) {
			if (!roleSignaturaId.startsWith('SIG-ACCURA-')) {
				roleSignaturaId = await createUniqueAccuraSignaturaId(
					prisma,
					rolePrefix === 'SADM' ? companyCode : companyCode,
					rolePrefix,
				);
			}
			link = await prisma.signaturaAppLink.create({
				data: {
					userId: user.id,
					signaturaId: roleSignaturaId,
					sourceApp: 'ACCURA',
					companyCode: rolePrefix === 'SADM' ? companyCode : companyCode,
					companyId: rolePrefix === 'SADM' ? 'accura-platform' : companyCode,
					role: normalizedRole,
					rolePrefix,
					registrationContext,
					status: 'ACTIVE',
				},
			});
			repaired = true;
		}

		return Response.json({
			ok: true,
			masterSignaturaId: user.signaturaId,
			roleSignaturaId,
			rolePrefix,
			repaired,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to resolve ACCURA role Signatura ID'),
			error.status ?? 400,
		);
	}
}
