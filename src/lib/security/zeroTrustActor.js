import { cookies } from 'next/headers';
import { ROLE_COOKIE, ROLES } from '@/lib/roles';
import { requireSession } from '@/lib/session';
import { authenticateBearerToken } from '@/lib/signatura-oauth';

// Service-to-service callers (e.g. HavenxSig) authenticate with a Signatura
// OAuth Bearer access token instead of an interactive passkey cookie session.
// On the bearer path the actor is pinned to a customer (ISSUER_ADMIN) role for
// its HOA tenant, and the valid, unexpired OAuth token stands in for the
// interactive verification factor. Provider-admin roles can never be reached
// through this path because the role is fixed and never read from a cookie.
const SERVICE_ACTOR_ROLE = ROLES.ISSUER_ADMIN;
const SERVICE_ACTOR_CREDENTIAL_ID = 'havenxsig-service';

// Resolve the caller of a zero-trust endpoint from either an interactive
// Signatura cookie session or a Signatura OAuth Bearer token. Returns null when
// neither credential is present/valid so the route can fail closed with 401.
async function resolveZeroTrustActor(req) {
	const cookieSession = await requireSession();
	if (cookieSession?.userId) {
		const cookieStore = await cookies();
		return {
			source: 'cookie',
			userId: cookieSession.userId,
			session: cookieSession,
			role: cookieStore.get(ROLE_COOKIE)?.value,
		};
	}

	const bearerSession = await authenticateBearerToken(req);
	if (bearerSession?.userId) {
		return {
			source: 'bearer',
			userId: bearerSession.userId,
			session: {
				userId: bearerSession.userId,
				reauthenticatedAt: Date.now(),
			},
			role: SERVICE_ACTOR_ROLE,
		};
	}

	return null;
}

export { SERVICE_ACTOR_CREDENTIAL_ID, SERVICE_ACTOR_ROLE, resolveZeroTrustActor };
