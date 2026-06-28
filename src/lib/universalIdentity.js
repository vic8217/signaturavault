import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

const APPLICATION_CODES = {
	SIGNATURA: 'SIGNATURA',
	ACCURA: 'ACCURA',
};

const ROLE_SCOPES = {
	PLATFORM: 'PLATFORM',
	ORGANIZATION: 'ORGANIZATION',
};

const UNIVERSAL_ROLE_CODES = {
	SIGNATURA_SYSTEM_ADMIN: 'SIGNATURA_SYSTEM_ADMIN',
	SIGNATURA_STAFF: 'SIGNATURA_STAFF',
	ISSUER_ADMIN: 'ISSUER_ADMIN',
	ISSUER_STAFF: 'ISSUER_STAFF',
	INVOICE_ISSUER: 'INVOICE_ISSUER',
	ACCURA_SYSTEM_ADMIN: 'ACCURA_SYSTEM_ADMIN',
	ACCURA_COMPANY_ADMIN: 'ACCURA_COMPANY_ADMIN',
	ACCURA_ACCOUNTING_CLERK: 'ACCURA_ACCOUNTING_CLERK',
	ACCURA_CASHIER: 'ACCURA_CASHIER',
	ACCURA_INVENTORY_CLERK: 'ACCURA_INVENTORY_CLERK',
	ACCURA_HR: 'ACCURA_HR',
	ACCURA_PAYROLL: 'ACCURA_PAYROLL',
};

function model(client = prisma, name) {
	return client?.[name] || null;
}

function normalizeCode(value) {
	return String(value || '')
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9_]/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_|_$/g, '');
}

function roleCodeFromAccuraRole(rolePrefix = '', roleName = '') {
	const prefix = normalizeCode(rolePrefix);
	if (prefix === 'SADM') return UNIVERSAL_ROLE_CODES.ACCURA_SYSTEM_ADMIN;
	if (prefix === 'CADM') return UNIVERSAL_ROLE_CODES.ACCURA_COMPANY_ADMIN;

	const name = normalizeCode(roleName);
	if (name.includes('ACCOUNT')) return UNIVERSAL_ROLE_CODES.ACCURA_ACCOUNTING_CLERK;
	if (name.includes('CASH')) return UNIVERSAL_ROLE_CODES.ACCURA_CASHIER;
	if (name.includes('INVENTORY')) return UNIVERSAL_ROLE_CODES.ACCURA_INVENTORY_CLERK;
	if (name.includes('PAYROLL')) return UNIVERSAL_ROLE_CODES.ACCURA_PAYROLL;
	if (name.includes('HR') || name.includes('HUMAN_RESOURCE')) {
		return UNIVERSAL_ROLE_CODES.ACCURA_HR;
	}
	return prefix ? `ACCURA_${prefix}` : UNIVERSAL_ROLE_CODES.ACCURA_COMPANY_ADMIN;
}

function roleNameFromCode(code) {
	return String(code || '')
		.split('_')
		.map((part) => part.charAt(0) + part.slice(1).toLowerCase())
		.join(' ');
}

async function ensureApplication(client, { code, name }) {
	const applicationModel = model(client, 'application');
	if (!applicationModel) return null;
	const normalizedCode = normalizeCode(code);
	const existing = await applicationModel.findUnique({
		where: { code: normalizedCode },
	});
	if (existing) return existing;
	return applicationModel.create({
		data: {
			id: `app_${normalizedCode.toLowerCase()}`,
			code: normalizedCode,
			name: name || roleNameFromCode(normalizedCode),
			status: 'ACTIVE',
		},
	});
}

async function ensureOrganization(
	client,
	{ id = '', name, type = 'ORGANIZATION', externalRef = '' },
) {
	if (!name && !id && !externalRef) return null;
	const organizationModel = model(client, 'organization');
	if (!organizationModel) return null;
	const lookupId = String(id || externalRef || '').trim();
	if (lookupId) {
		const existingById = await organizationModel.findUnique({
			where: { id: lookupId },
		}).catch(() => null);
		if (existingById) return existingById;
	}
	if (externalRef) {
		const existingByRef = await organizationModel.findFirst({
			where: { externalRef },
			orderBy: { createdAt: 'desc' },
		});
		if (existingByRef) return existingByRef;
	}
	return organizationModel.create({
		data: {
			id: lookupId || crypto.randomUUID(),
			name: name || lookupId || 'Organization',
			type,
			externalRef: externalRef || lookupId || null,
			status: 'ACTIVE',
		},
	});
}

async function ensureRole(
	client,
	{ applicationId, organizationId = null, code, name, scope },
) {
	const roleModel = model(client, 'role');
	if (!roleModel) return null;
	const normalizedCode = normalizeCode(code);
	const existing = await roleModel.findFirst({
		where: {
			applicationId,
			organizationId,
			code: normalizedCode,
		},
		orderBy: { createdAt: 'desc' },
	});
	if (existing) return existing;
	return roleModel.create({
		data: {
			id: `role_${applicationId}_${organizationId || 'platform'}_${normalizedCode}`
				.toLowerCase()
				.replace(/[^a-z0-9_]/g, '_')
				.slice(0, 180),
			applicationId,
			organizationId,
			code: normalizedCode,
			name: name || roleNameFromCode(normalizedCode),
			scope: scope || (organizationId ? ROLE_SCOPES.ORGANIZATION : ROLE_SCOPES.PLATFORM),
			status: 'ACTIVE',
		},
	});
}

async function ensureMembershipWithRole(
	client = prisma,
	{
		identityId,
		applicationCode,
		applicationName,
		organizationId = null,
		organizationName = '',
		organizationType = 'ORGANIZATION',
		organizationExternalRef = '',
		roleCode,
		roleName = '',
		roleScope = '',
		membershipStatus = 'ACTIVE',
		invitedById = null,
	},
) {
	if (!identityId) throw new Error('identityId is required');
	const membershipModel = model(client, 'membership');
	const membershipRoleModel = model(client, 'membershipRole');
	if (!membershipModel || !membershipRoleModel) return null;

	const application = await ensureApplication(client, {
		code: applicationCode,
		name: applicationName,
	});
	const organization =
		organizationId || organizationName || organizationExternalRef
			? await ensureOrganization(client, {
					id: organizationId,
					name: organizationName,
					type: organizationType,
					externalRef: organizationExternalRef || organizationId,
				})
			: null;

	const membership =
		(await membershipModel.findFirst({
			where: {
				identityId,
				applicationId: application.id,
				organizationId: organization?.id || null,
			},
			orderBy: { createdAt: 'desc' },
		})) ||
		(await membershipModel.create({
			data: {
				identityId,
				applicationId: application.id,
				organizationId: organization?.id || null,
				status: membershipStatus,
				invitedById,
			},
		}));
	if (membership.status !== membershipStatus) {
		await membershipModel.update({
			where: { id: membership.id },
			data: { status: membershipStatus },
		});
		membership.status = membershipStatus;
	}

	const role = await ensureRole(client, {
		applicationId: application.id,
		organizationId: organization?.id || null,
		code: roleCode,
		name: roleName,
		scope:
			roleScope ||
			(organization?.id ? ROLE_SCOPES.ORGANIZATION : ROLE_SCOPES.PLATFORM),
	});

	const existingMembershipRole = await membershipRoleModel.findFirst({
		where: { membershipId: membership.id, roleId: role.id },
	});
	if (!existingMembershipRole) {
		await membershipRoleModel.create({
			data: {
				membershipId: membership.id,
				roleId: role.id,
			},
		});
	}

	return { application, organization, membership, role };
}

async function ensureSignaturaPlatformRole(client, identityId, roleCode) {
	return ensureMembershipWithRole(client, {
		identityId,
		applicationCode: APPLICATION_CODES.SIGNATURA,
		applicationName: 'Signatura',
		roleCode,
		roleName: roleNameFromCode(roleCode),
		roleScope: ROLE_SCOPES.PLATFORM,
	});
}

async function ensureIssuerMembershipRole(
	client,
	{
		identityId,
		tenantId,
		issuerId = null,
		issuerName = '',
		roleCode,
		membershipStatus = 'ACTIVE',
	},
) {
	return ensureMembershipWithRole(client, {
		identityId,
		applicationCode: APPLICATION_CODES.SIGNATURA,
		applicationName: 'Signatura',
		organizationId: tenantId,
		organizationName: issuerName || tenantId || 'Issuer',
		organizationType: 'ISSUER',
		organizationExternalRef: tenantId,
		roleCode,
		roleName: roleNameFromCode(roleCode),
		roleScope: ROLE_SCOPES.ORGANIZATION,
		membershipStatus,
	});
}

async function ensureInvoiceIssuerMembershipRole(
	client,
	{
		identityId,
		companyId,
		companyCode = '',
		companyName = '',
		membershipStatus = 'ACTIVE',
	},
) {
	const organizationRef = companyId || companyCode;
	const organizationId = organizationRef ? `invoice_issuer_${organizationRef}` : '';
	return ensureMembershipWithRole(client, {
		identityId,
		applicationCode: APPLICATION_CODES.SIGNATURA,
		applicationName: 'Signatura',
		organizationId,
		organizationName: companyName || companyCode || organizationRef || 'Invoice Issuer',
		organizationType: 'INVOICE_ISSUER',
		organizationExternalRef: organizationId || organizationRef || companyCode,
		roleCode: UNIVERSAL_ROLE_CODES.INVOICE_ISSUER,
		roleName: 'Invoice Issuer',
		roleScope: ROLE_SCOPES.ORGANIZATION,
		membershipStatus,
	});
}

async function ensureAccuraMembershipRole(
	client,
	{
		identityId,
		companyId,
		companyCode,
		companyName,
		rolePrefix,
		roleName,
	},
) {
	const roleCode = roleCodeFromAccuraRole(rolePrefix, roleName);
	return ensureMembershipWithRole(client, {
		identityId,
		applicationCode: APPLICATION_CODES.ACCURA,
		applicationName: 'Accura',
		organizationId: roleCode === UNIVERSAL_ROLE_CODES.ACCURA_SYSTEM_ADMIN ? null : companyId,
		organizationName: companyName || companyCode || companyId || 'Accura',
		organizationType: 'ACCURA_COMPANY',
		organizationExternalRef: companyId || companyCode,
		roleCode,
		roleName: roleName || roleNameFromCode(roleCode),
		roleScope:
			roleCode === UNIVERSAL_ROLE_CODES.ACCURA_SYSTEM_ADMIN
				? ROLE_SCOPES.PLATFORM
				: ROLE_SCOPES.ORGANIZATION,
	});
}

async function getIdentityContexts(identityId) {
	const membershipModel = model(prisma, 'membership');
	if (!membershipModel || !identityId) return [];
	const memberships = await membershipModel.findMany({
		where: {
			identityId,
			status: 'ACTIVE',
		},
		include: {
			application: true,
			organization: true,
			roles: {
				include: {
					role: {
						include: {
							permissions: {
								include: { permission: true },
							},
						},
					},
				},
			},
		},
		orderBy: { createdAt: 'asc' },
	});

	return memberships.map((membership) => ({
		membershipId: membership.id,
		status: membership.status,
		application: membership.application
			? {
					id: membership.application.id,
					code: membership.application.code,
					name: membership.application.name,
				}
			: null,
		organization: membership.organization
			? {
					id: membership.organization.id,
					name: membership.organization.name,
					type: membership.organization.type,
					status: membership.organization.status,
				}
			: null,
		roles: membership.roles.map((entry) => ({
			id: entry.role.id,
			code: entry.role.code,
			name: entry.role.name,
			scope: entry.role.scope,
		})),
		permissions: [
			...new Set(
				membership.roles.flatMap((entry) =>
					entry.role.permissions.map((rolePermission) =>
						rolePermission.permission.code,
					),
				),
			),
		],
	}));
}

async function identityHasUniversalRole(
	identityId,
	options = {},
) {
	const {
		applicationCode,
		roleCodes = [],
		organizationId = null,
	} = options;
	const membershipModel = model(prisma, 'membership');
	if (!membershipModel || !identityId) return false;
	const codes = roleCodes.map(normalizeCode).filter(Boolean);
	const membership = await membershipModel.findFirst({
		where: {
			identityId,
			status: 'ACTIVE',
			...(organizationId !== undefined ? { organizationId } : {}),
			application: applicationCode ? { code: normalizeCode(applicationCode) } : undefined,
			roles: {
				some: {
					role: {
						code: { in: codes },
						status: 'ACTIVE',
					},
				},
			},
		},
		select: { id: true },
	});
	return Boolean(membership);
}

export {
	APPLICATION_CODES,
	ROLE_SCOPES,
	UNIVERSAL_ROLE_CODES,
	ensureAccuraMembershipRole,
	ensureApplication,
	ensureInvoiceIssuerMembershipRole,
	ensureIssuerMembershipRole,
	ensureMembershipWithRole,
	ensureSignaturaPlatformRole,
	getIdentityContexts,
	identityHasUniversalRole,
	roleCodeFromAccuraRole,
};
