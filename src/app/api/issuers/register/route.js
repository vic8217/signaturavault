import { hashValue } from '@/lib/auth';
import { generateId } from '@/lib/db';
import { createIssuerAuthorizationCode } from '@/lib/issuer-authorization';
import { prisma } from '@/lib/prisma';
import { ROLE_COOKIE, ROLES } from '@/lib/roles';
import { requireSession } from '@/lib/session';
import { redactForLog } from '@/lib/security';

function normalizeIdentity(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

export async function POST(req) {
	const payload = await req.json();
	const session = await requireSession();
	if (!session) {
		return Response.json({ error: 'Authentication required' }, { status: 401 });
	}

	const role = req.cookies.get(ROLE_COOKIE)?.value;

	if (role !== ROLES.SIGNATURA_ADMIN && role !== ROLES.SIGNATURA_STAFF) {
		return Response.json({ error: 'Admin role required' }, { status: 403 });
	}

	const {
		issuerName,
		tenantName,
		issuerType,
		registeredName,
		registrationDate,
	} = payload;
	const normalizedIssuerName = issuerName || registeredName;
	const normalizedTenantName = tenantName || registeredName;

	if (
		!normalizedIssuerName ||
		!normalizedTenantName ||
		!issuerType ||
		!registrationDate
	) {
		return new Response(
			JSON.stringify({
				error:
					'issuerType, registeredName, and registrationDate are required',
			}),
			{ status: 400 },
		);
	}

	const normalizedName = normalizeIdentity(normalizedIssuerName);
	const existingIssuers = await prisma.issuer.findMany({
		where: { status: 'active' },
		select: { id: true, tenantId: true, name: true },
	});
	const duplicateIssuer = existingIssuers.find((issuer) => {
		return normalizeIdentity(issuer.name) === normalizedName;
	});

	if (duplicateIssuer) {
		return Response.json(
			{
				error:
					'Issuer is already registered. Use the existing issuer record instead.',
				issuerId: duplicateIssuer.id,
				tenantId: duplicateIssuer.tenantId,
			},
			{ status: 409 },
		);
	}

	const tenantId = generateId('tenant');
	const issuerId = generateId('issuer');
	const issuerApiClientId = generateId('issuer_client');
	const issuerClientPublicId = generateId('cid');
	const apiKeyId = generateId('apikey');
	const apiKey = generateId('key');
	const clientSecret = generateId('secret');

	await prisma.$transaction([
		prisma.tenant.create({
			data: {
				id: tenantId,
				name: normalizedTenantName,
				externalReference: null,
			},
		}),
		prisma.issuer.create({
			data: {
				id: issuerId,
				tenantId,
				name: normalizedIssuerName,
				contactEmail: null,
				type: issuerType,
				address: null,
				registrationNumber: null,
				registrationDate: new Date(registrationDate),
				status: 'active',
			},
		}),
		prisma.issuerApiClient.create({
			data: {
				id: issuerApiClientId,
				tenantId,
				name: `${normalizedIssuerName} default client`,
				clientId: issuerClientPublicId,
				clientSecretHash: hashValue(clientSecret),
				scopes: ['document:read', 'document:write', 'verification:read'],
			},
		}),
		prisma.issuerApiKey.create({
			data: {
				id: apiKeyId,
				tenantId,
				apiClientId: issuerApiClientId,
				keyHash: hashValue(apiKey),
				status: 'active',
			},
		}),
		prisma.auditLog.create({
			data: {
				id: generateId('audit'),
				tenantId,
				issuerId,
				userId: null,
				action: 'issuer_registered',
				target: issuerId,
				details: redactForLog({
					issuerName: normalizedIssuerName,
					issuerType,
					registrationDate,
					privateFieldsStoredAsPlaintext: false,
					storage: 'prisma',
				}),
			},
		}),
	]);

	const authorizationCode = await createIssuerAuthorizationCode({
		issuerId,
		tenantId,
		label: `${normalizedIssuerName} issuer onboarding`,
	});

	return new Response(
		JSON.stringify({
			tenantId,
			issuerId,
			authorizationCode,
			apiClient: {
				clientId: issuerClientPublicId,
				clientSecret,
				apiKey,
			},
		}),
		{ status: 201 },
	);
}
