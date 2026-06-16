import { hashValue } from '@/lib/auth';
import { withDb, generateId, now } from '@/lib/db';
import { createIssuerAuthorizationCode } from '@/lib/issuer-authorization';
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

	return withDb(async (db) => {
		const normalizedName = normalizeIdentity(normalizedIssuerName);
		const duplicateIssuer = db.issuers.find((issuer) => {
			return normalizeIdentity(issuer.name) === normalizedName;
		});

		if (duplicateIssuer) {
			return Response.json(
				{
					error:
						'Issuer is already registered. Use the existing issuer record instead.',
					issuerId: duplicateIssuer.id,
					tenantId: duplicateIssuer.tenant_id,
				},
				{ status: 409 },
			);
		}

		const tenantId = generateId('tenant');
		const issuerId = generateId('issuer');
		const apiClientId = generateId('client');
		const apiKeyId = generateId('apikey');
		const apiKey = generateId('key');
		const clientSecret = generateId('secret');

		db.tenants.push({
			id: tenantId,
			name: normalizedTenantName,
			external_reference: null,
			created_at: now(),
			updated_at: now(),
		});

		db.issuers.push({
			id: issuerId,
			tenant_id: tenantId,
			name: normalizedIssuerName,
			contact_email: null,
			type: issuerType,
			address: null,
			registration_number: null,
			registration_date: registrationDate,
			status: 'active',
			created_at: now(),
			updated_at: now(),
		});

		db.issuer_api_clients.push({
			id: apiClientId,
			tenant_id: tenantId,
			name: `${normalizedIssuerName} default client`,
			client_id: generateId('cid'),
			client_secret_hash: hashValue(clientSecret),
			scopes: ['document:read', 'document:write', 'verification:read'],
			created_at: now(),
			updated_at: now(),
		});

		db.issuer_api_keys.push({
			id: apiKeyId,
			tenant_id: tenantId,
			api_client_id: apiClientId,
			key_hash: hashValue(apiKey),
			status: 'active',
			created_at: now(),
			updated_at: now(),
		});

		db.audit_logs.push({
			id: generateId('audit'),
			tenant_id: tenantId,
			issuer_id: issuerId,
			user_id: null,
			action: 'issuer_registered',
			target: issuerId,
			details: redactForLog({
				issuerName: normalizedIssuerName,
				issuerType,
				registrationDate,
				privateFieldsStoredAsPlaintext: false,
			}),
			created_at: now(),
		});

		const authorizationCode = await createIssuerAuthorizationCode({
			issuerId,
			tenantId,
			label: `${normalizedIssuerName} issuer onboarding`,
			db,
		});

		return new Response(
			JSON.stringify({
				tenantId,
				issuerId,
				authorizationCode,
				apiClient: {
					clientId: apiClientId,
					clientSecret,
					apiKey,
				},
			}),
			{ status: 201 },
		);
	});
}
