import { loadDb } from '@/lib/db';
import { ROLE_COOKIE, ROLES } from '@/lib/roles';

function normalizeIdentity(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

export async function GET(req) {
	const role = req.cookies.get(ROLE_COOKIE)?.value;

	if (role !== ROLES.SIGNATURA_ADMIN && role !== ROLES.SIGNATURA_STAFF) {
		return Response.json({ error: 'Admin role required' }, { status: 403 });
	}

	const db = await loadDb();
	const tenantsById = new Map(
		db.tenants.map((tenant) => [tenant.id, tenant]),
	);

	const issuersByIdentity = new Map();

	for (const issuer of db.issuers) {
		const identity =
			normalizeIdentity(issuer.registration_number) ||
			normalizeIdentity(issuer.name);
		const currentIssuer = issuersByIdentity.get(identity);

		if (
			!currentIssuer ||
			new Date(issuer.created_at) > new Date(currentIssuer.created_at)
		) {
			issuersByIdentity.set(identity, issuer);
		}
	}

	const issuers = Array.from(issuersByIdentity.values())
		.map((issuer) => {
			const tenant = tenantsById.get(issuer.tenant_id);

			return {
				id: issuer.id,
				tenantId: issuer.tenant_id,
				tenantName: tenant?.name || issuer.name,
				name: issuer.name,
				type: issuer.type || null,
				address: issuer.address || null,
				registrationNumber: issuer.registration_number || null,
				registrationDate: issuer.registration_date || null,
				status: issuer.status,
				contactEmail: issuer.contact_email || null,
				createdAt: issuer.created_at,
				updatedAt: issuer.updated_at,
			};
		})
		.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

	return Response.json({ issuers }, { status: 200 });
}
