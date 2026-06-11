import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/session';
import { ROLE_COOKIE, ROLE_HOME, ROLES, isKnownRole } from '@/lib/roles';

export async function resolveSignaturaHomePath(fallback = '/signatura/dashboard') {
	const session = await requireSession();
	if (!session?.userId) return null;

	const cookieStore = await cookies();
	const role = cookieStore.get(ROLE_COOKIE)?.value;
	if (isKnownRole(role)) {
		return ROLE_HOME[role];
	}

	const issuerUser = await prisma.issuerUser.findFirst({
		where: {
			userId: session.userId,
			status: 'active',
		},
		orderBy: { activatedAt: 'desc' },
	});
	if (issuerUser) {
		const issuerRole =
			issuerUser.role === ROLES.ISSUER_ADMIN
				? ROLES.ISSUER_ADMIN
				: ROLES.ISSUER_STAFF;
		return ROLE_HOME[issuerRole];
	}

	return fallback;
}
