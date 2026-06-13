import { requireSession } from '@/lib/session';
import { ROLE_COOKIE, ROLES } from '@/lib/roles';

async function requireAdminRequest(req) {
	const session = await requireSession();
	if (!session) {
		return { ok: false, response: Response.json({ error: 'Authentication required' }, { status: 401 }) };
	}

	const role = req.cookies.get(ROLE_COOKIE)?.value;
	if (role !== ROLES.SIGNATURA_ADMIN && role !== ROLES.SIGNATURA_STAFF) {
		return { ok: false, response: Response.json({ error: 'Admin role required' }, { status: 403 }) };
	}

	return { ok: true, session };
}

export { requireAdminRequest };
