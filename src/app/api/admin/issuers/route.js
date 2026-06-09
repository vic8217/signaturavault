import { loadDb } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { ROLE_COOKIE, ROLES } from '@/lib/roles';
import { redactIssuerForProvider } from '@/lib/security';

function normalizeIdentity(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

export async function GET(req) {
	const session = await requireSession();
	if (!session) {
		return Response.json({ error: 'Authentication required' }, { status: 401 });
	}

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

			return redactIssuerForProvider(issuer, tenant);
		})
		.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

	return Response.json({ issuers }, { status: 200 });
}
