import { cookies } from 'next/headers';
import { loadDb, saveDb } from '@/lib/db';
import { prisma } from '@/lib/prisma';
import { ROLE_COOKIE, ROLES } from '@/lib/roles';
import { requireSession } from '@/lib/session';

function usesDevIssuerRegistry() {
	return process.env.NODE_ENV !== 'production';
}

function profileFromIssuer(issuer, source = 'prisma') {
	if (!issuer) return null;

	return {
			id: issuer.id,
			tenantId: issuer.tenantId || issuer.tenant_id,
			name: issuer.name,
			type: issuer.type || '',
			registrationDate: issuer.registrationDate || issuer.registration_date || '',
		status: issuer.status || 'active',
		logoUrl: issuer.logoUrl || issuer.logo_url || issuer.logo || '',
		website: issuer.website || '',
		description: issuer.description || '',
		source,
	};
}

async function getDevIssuerFallback(tenantId = '') {
	if (!usesDevIssuerRegistry()) return null;

	const db = await loadDb();
	const issuers = db.issuers || [];
	const issuer = tenantId
		? issuers.find((item) => item.tenant_id === tenantId)
		: issuers.length === 1
			? issuers[0]
			: null;

	return profileFromIssuer(issuer, 'dev-registry');
}

async function getActiveIssuerProfile() {
	const session = await requireSession();
	if (!session?.userId) return null;

	let issuerUser = null;
	try {
		issuerUser = await prisma.issuerUser.findFirst({
			where: {
				userId: session.userId,
				status: 'active',
			},
			orderBy: { activatedAt: 'desc' },
		});

		if (issuerUser) {
			const issuer = issuerUser.issuerId
				? await prisma.issuer.findFirst({
						where: {
							id: issuerUser.issuerId,
							tenantId: issuerUser.tenantId,
						},
					})
				: await prisma.issuer.findFirst({
						where: {
							tenantId: issuerUser.tenantId,
							status: 'active',
						},
						orderBy: { createdAt: 'asc' },
					});

			if (issuer) {
				const profile = profileFromIssuer(issuer, 'prisma');
				const devProfile = await getDevIssuerFallback(issuerUser.tenantId);
				return {
					...profile,
					logoUrl: devProfile?.logoUrl || profile.logoUrl,
					website: devProfile?.website || profile.website,
					description: devProfile?.description || profile.description,
				};
			}
		}
	} catch {
		issuerUser = null;
	}

	return getDevIssuerFallback(issuerUser?.tenantId || '');
}

async function requireIssuerProfileContext() {
	const cookieStore = await cookies();
	const role = cookieStore.get(ROLE_COOKIE)?.value;
	if (![ROLES.ISSUER_ADMIN, ROLES.ISSUER_STAFF].includes(role)) {
		return { error: Response.json({ error: 'Issuer role required' }, { status: 403 }) };
	}

	const profile = await getActiveIssuerProfile();
	if (!profile) {
		return {
			error: Response.json(
				{ error: 'No issuer profile is linked to this account' },
				{ status: 404 },
			),
		};
	}

	return { profile, role };
}

async function updateActiveIssuerProfile(input) {
	const context = await requireIssuerProfileContext();
	if (context.error) return context;

	const profile = context.profile;
		const patch = {
			name: String(input.name || profile.name || '').trim(),
			type: String(input.type || '').trim(),
			registrationDate: String(input.registrationDate || '').trim(),
		logoUrl: String(input.logoUrl || '').trim(),
		website: String(input.website || '').trim(),
		description: String(input.description || '').trim(),
	};

	if (!patch.name) {
		return {
			error: Response.json({ error: 'Issuer name is required' }, { status: 400 }),
		};
	}

	if (profile.source === 'prisma') {
		try {
			await prisma.issuer.update({
				where: { id: profile.id },
					data: {
						name: patch.name,
						type: patch.type || null,
						registrationDate: patch.registrationDate
						? new Date(patch.registrationDate)
						: null,
				},
			});
		} catch {
			// Profile extras still persist to the local dev registry below.
		}
	}

	if (usesDevIssuerRegistry()) {
		const db = await loadDb();
		const issuerIndex = (db.issuers || []).findIndex(
			(issuer) => issuer.id === profile.id || issuer.tenant_id === profile.tenantId,
		);
		if (issuerIndex >= 0) {
			db.issuers[issuerIndex] = {
					...db.issuers[issuerIndex],
					name: patch.name,
					type: patch.type || null,
					registration_date: patch.registrationDate || null,
				logo_url: patch.logoUrl || null,
				website: patch.website || null,
				description: patch.description || null,
				updated_at: new Date().toISOString(),
			};
			await saveDb(db);
		}
	}

	return {
		profile: {
			...profile,
			...patch,
		},
	};
}

export {
	getActiveIssuerProfile,
	requireIssuerProfileContext,
	updateActiveIssuerProfile,
};
