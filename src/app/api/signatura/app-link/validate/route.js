import { prisma } from '@/lib/prisma';
import { normalizeSignaturaId } from '@/lib/identity';
import {
	normalizeAccuraRole,
	normalizeAccuraRolePrefix,
	normalizeCompanyCode,
	normalizeRegistrationSource,
	sourceAppLabel,
} from '@/lib/registrationSource';

const INVALID_RESPONSE = {
	valid: false,
	message: 'This Signatura ID is not authorized for the selected company or role.',
};

// Public app-link validation only. ACCURA must use /api/signatura/introspect
// for trusted-device and Zero Trust Level 2 assurance.
export async function POST(req) {
	const body = await req.json().catch(() => ({}));
	const source = normalizeRegistrationSource(body.source);
	const sourceApp = sourceAppLabel(source.source);
	const signaturaId = normalizeSignaturaId(body.signaturaId);
	const companyCode = normalizeCompanyCode(body.companyCode);
	const role = normalizeAccuraRole(body.role);
	const rolePrefix = normalizeAccuraRolePrefix(body.rolePrefix);

	if (
		source.error ||
		source.source !== 'accura' ||
		!signaturaId ||
		!role ||
		!rolePrefix
	) {
		return Response.json(INVALID_RESPONSE, { status: 200 });
	}

	const link = await prisma.signaturaAppLink.findFirst({
		where: {
			signaturaId,
			sourceApp,
			companyCode: rolePrefix === 'SADM' ? null : companyCode,
			role,
			rolePrefix,
			status: 'ACTIVE',
		},
		select: {
			status: true,
			sourceApp: true,
			companyCode: true,
			role: true,
			rolePrefix: true,
		},
	});

	if (!link) {
		return Response.json(INVALID_RESPONSE, { status: 200 });
	}

	return Response.json({
		valid: true,
		status: link.status,
		sourceApp: link.sourceApp,
		companyCode: link.companyCode,
		role: link.role,
		rolePrefix: link.rolePrefix,
	});
}
