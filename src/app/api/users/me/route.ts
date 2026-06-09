import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import {
	authenticateBearerToken,
	corsHeadersForRequest,
	corsPreflight,
} from '@/lib/signatura-oauth';

export async function OPTIONS(req: Request) {
	return corsPreflight(req);
}

export async function GET(req: Request) {
	try {
		const corsHeaders = await corsHeadersForRequest(req);
		const tokenSession = await authenticateBearerToken(req);
		if (!tokenSession) {
			return jsonError('Bearer token is required or invalid', 401);
		}

		const [user, trustedDevice, consent] = await Promise.all([
			prisma.user.findUnique({
				where: { id: tokenSession.userId },
				select: { id: true },
			}),
			prisma.trustedDevice.findFirst({
				where: {
					userId: tokenSession.userId,
					status: 'active',
					isTrusted: true,
					removedAt: null,
				},
				select: { id: true },
			}),
			prisma.consent.findFirst({
				where: {
					userId: tokenSession.userId,
					status: 'approved',
				},
				orderBy: { createdAt: 'desc' },
				select: { id: true },
			}),
		]);

		if (!user) return jsonError('User not found', 404);

		return Response.json(
			{
				signatura_user_id: user.id,
				verified_identity: true,
				trusted_device: Boolean(trustedDevice),
				consent_id: consent?.id || null,
			},
			{ headers: corsHeaders },
		);
	} catch (error) {
		return jsonError(safeApiErrorMessage(error, 'Unable to load profile'), 400);
	}
}
