import { hashValue } from '@/lib/auth';
import { withDb, generateId, now } from '@/lib/db';
import { ROLE_COOKIE, ROLES } from '@/lib/roles';

function normalizeIdentity(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

export async function POST(req) {
	const payload = await req.json();
	const role = req.cookies.get(ROLE_COOKIE)?.value;

	if (role !== ROLES.SIGNATURA_ADMIN && role !== ROLES.SIGNATURA_STAFF) {
		return Response.json({ error: 'Admin role required' }, { status: 403 });
	}

	const {
		issuerName,
		tenantName,
		contactEmail,
		issuerType,
		registeredName,
		address,
		registrationNumber,
		registrationDate,
	} = payload;
	const normalizedIssuerName = issuerName || registeredName;
	const normalizedTenantName = tenantName || registeredName;

	if (
		!normalizedIssuerName ||
		!normalizedTenantName ||
		!issuerType ||
		!address ||
		!registrationNumber ||
		!registrationDate
	) {
		return new Response(
			JSON.stringify({
				error:
					'issuerType, registeredName, address, registrationNumber, and registrationDate are required',
			}),
			{ status: 400 },
		);
	}

	return withDb(async (db) => {
		const normalizedRegistrationNumber = normalizeIdentity(registrationNumber);
		const normalizedName = normalizeIdentity(normalizedIssuerName);
		const duplicateIssuer = db.issuers.find((issuer) => {
			const issuerRegistrationNumber = normalizeIdentity(
				issuer.registration_number,
			);

			if (issuerRegistrationNumber && normalizedRegistrationNumber) {
				return issuerRegistrationNumber === normalizedRegistrationNumber;
			}

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
			contact_email: contactEmail || null,
			type: issuerType,
			address,
			registration_number: registrationNumber,
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
			details: {
				issuerName: normalizedIssuerName,
				contactEmail: contactEmail || null,
				issuerType,
				registrationNumber,
				registrationDate,
			},
			created_at: now(),
		});

		return new Response(
			JSON.stringify({
				tenantId,
				issuerId,
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
