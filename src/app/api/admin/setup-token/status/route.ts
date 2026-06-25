import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	ADMIN_SETUP_TOKEN_PURPOSE,
	adminSetupTokenModel,
	hashAdminSetupToken,
} from '@/lib/adminSetupToken';
import { REGISTRATION_STATUSES } from '@/lib/registration-status';
import { findRegistrationSession } from '@/lib/registration-session';
import { createAuthenticatedLoginResponse } from '@/lib/auth/loginSession';
import { logSecurityEvent } from '@/lib/webauthn';

export async function POST(req: Request) {
	try {
		const body = await req.json().catch(() => ({}));
		const token = String(body.token || '').trim();
		const userId = String(body.userId || '').trim();
		const registrationSessionId = String(body.registrationSessionId || '').trim();

		if (!token || !userId || !registrationSessionId) {
			return jsonError('token, userId, and registrationSessionId are required', 400);
		}

		const activeSession = await findRegistrationSession({
			registrationSessionId,
			userId,
			renewIfExpired: true,
		});
		const completedSession =
			activeSession ||
			(await prisma.authChallenge.findFirst({
				where: {
					id: registrationSessionId,
					userId,
					type: 'REGISTER_ACCOUNT',
				},
				orderBy: { createdAt: 'desc' },
			}));
		const session = activeSession || completedSession;
		if (!session) {
			return jsonError('Registration session expired. Sign in from /admin.', 404);
		}

		const record = await adminSetupTokenModel().findUnique({
			where: { tokenHash: hashAdminSetupToken(token) },
			include: { user: true },
		});
		if (
			!record ||
			record.userId !== userId ||
			record.purpose !== ADMIN_SETUP_TOKEN_PURPOSE
		) {
			await logSecurityEvent(req, 'admin_setup_token_poll_failed', userId || null, {
				reason: 'token_mismatch',
			});
			return jsonError('Invalid setup link.', 404);
		}

		if (record.status === 'ACTIVE' && record.expiresAt <= new Date()) {
			await adminSetupTokenModel().update({
				where: { id: record.id },
				data: { status: 'EXPIRED' },
			});
			return Response.json({
				ok: true,
				status: 'EXPIRED',
				message: 'This setup QR has expired.',
			});
		}

		if (record.status !== 'USED' || !record.usedAt) {
			return Response.json({
				ok: true,
				status: record.status,
				used: false,
				expiresAt: record.expiresAt.toISOString(),
			});
		}

		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (
			user &&
			user.accountStatus !== 'active' &&
			user.accountStatus !== REGISTRATION_STATUSES.COMPLETED
		) {
			return Response.json({
				ok: true,
				status: record.status,
				used: true,
				requiresRecovery: true,
				currentStep: user.accountStatus,
				message: 'Admin passkey is registered. Complete recovery setup on your phone before opening the admin portal.',
			});
		}
		if (!user || user.accountStatus !== 'active' || user.trustLevel < 2) {
			return jsonError('Admin setup is not active yet.', 409);
		}

		await logSecurityEvent(req, 'admin_setup_desktop_session_created', userId, {
			tokenId: record.id,
			registrationSessionId,
		});

		return createAuthenticatedLoginResponse({
			req,
			user,
			nextPath: '/admin',
			eventName: 'admin_setup_desktop_login_created',
			eventDetails: {
				tokenId: record.id,
				registrationSessionId,
			},
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to check admin setup status'),
			400,
		);
	}
}
