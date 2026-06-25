import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { normalizeSignaturaId } from '@/lib/identity';
import { normalizeAccuraRole, normalizeAccuraRolePrefix } from '@/lib/registrationSource';
import { ensureAccuraMembershipRole } from '@/lib/universalIdentity';

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
			return jsonError(
				'ACCURA role-specific Signatura IDs are deprecated. Use the user master Signatura ID.',
				409,
			);
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
		const roleSignaturaId = user.signaturaId;

		const registrationContext =
			link?.registrationContext && typeof link.registrationContext === 'object'
				? { ...link.registrationContext, masterSignaturaId: user.signaturaId }
				: { masterSignaturaId: user.signaturaId };
		const normalizedRole = rolePrefix === 'SADM' ? 'system_admin' : link?.role || null;
		const needsRoleRepair =
			link &&
			(!link.role || normalizeAccuraRole(link.role) !== normalizedRole);

		await ensureAccuraMembershipRole(prisma, {
			identityId: user.id,
			companyId: rolePrefix === 'SADM' ? 'accura-platform' : link?.companyId || companyCode,
			companyCode,
			companyName: link?.companyName || companyCode,
			rolePrefix,
			roleName: normalizedRole,
		});

		if (link && (needsRoleRepair || link.signaturaId !== roleSignaturaId)) {
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
			universalIdentity: true,
			repaired,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to resolve ACCURA role Signatura ID'),
			error.status ?? 400,
		);
	}
}
