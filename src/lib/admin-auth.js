import { cookies } from 'next/headers';
import { ROLE_COOKIE, ROLES } from '@/lib/roles';

async function requireAdminRole() {
	const cookieStore = await cookies();
	const role = cookieStore.get(ROLE_COOKIE)?.value;
	if (![ROLES.SIGNATURA_ADMIN, ROLES.SIGNATURA_STAFF].includes(role)) {
		return { error: Response.json({ error: 'Admin role required' }, { status: 403 }) };
	}
	return { role };
}

export { requireAdminRole };
