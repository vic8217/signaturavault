import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	SIGNATURA_ACCOUNT_TYPES,
	getSignaturaAccountType,
	userPublicIdentity,
} from '@/lib/identity';
import { assertPhoneReachableSignaturaOrigin } from '@/lib/publicOrigin';
import { findRegistrationSession } from '@/lib/registration-session';
import { createAdminSetupTokenRecord } from '@/lib/adminSetupToken';
import { assertSecureWebAuthnRequest } from '@/lib/webauthn';
import {
	APPLICATION_CODES,
	UNIVERSAL_ROLE_CODES,
	identityHasUniversalRole,
} from '@/lib/universalIdentity';

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json().catch(() => ({}));
		const userId = String(body.userId || '').trim();
		const registrationSessionId = String(body.registrationSessionId || '').trim();

		if (!userId || !registrationSessionId) {
			return jsonError('userId and registrationSessionId are required', 400);
		}

		const session = await findRegistrationSession({
			registrationSessionId,
			userId,
			renewIfExpired: true,
		});
		if (!session) {
			return jsonError('Registration session expired. Create a new admin account.', 404);
		}

		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				signaturaId: true,
				accountStatus: true,
				trustLevel: true,
			},
		});
		if (!user) return jsonError('Admin account not found', 404);
		const hasAdminMembership = await identityHasUniversalRole(user.id, {
			applicationCode: APPLICATION_CODES.SIGNATURA,
			roleCodes: [UNIVERSAL_ROLE_CODES.SIGNATURA_SYSTEM_ADMIN],
			organizationId: null,
		});
		const hasLegacyAdminId =
			getSignaturaAccountType(user.signaturaId) === SIGNATURA_ACCOUNT_TYPES.ADMIN;
		if (!hasAdminMembership && !hasLegacyAdminId) {
			return jsonError('Setup QR can only be created for admin accounts', 403);
		}
		if (user.accountStatus === 'active' || user.trustLevel >= 2) {
			return jsonError('This admin account is already active', 409);
		}

		const origin = assertPhoneReachableSignaturaOrigin(req);
		const { rawToken, expiresAt } = await createAdminSetupTokenRecord({
			req,
			userId,
			createdById: userId,
		});
		const setupUrl = new URL('/admin/setup', origin);
		setupUrl.searchParams.set('token', rawToken);

		return NextResponse.json({
			ok: true,
			setupUrl: setupUrl.toString(),
			qrPayload: setupUrl.toString(),
			expiresAt: expiresAt.toISOString(),
			user: userPublicIdentity(user),
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to create admin setup QR'),
			(error as Error & { status?: number }).status ?? 400,
		);
	}
}
