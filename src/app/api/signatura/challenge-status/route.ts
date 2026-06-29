import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';

function normalizeChallengeId(value: string | null) {
	return String(value || '').trim().slice(0, 200);
}

function publicStatus(record: {
	status?: string | null;
	expiresAt?: Date | string | null;
}) {
	const status = String(record.status || 'PENDING').toUpperCase();
	if (
		status !== 'APPROVED' &&
		record.expiresAt &&
		new Date(record.expiresAt).getTime() <= Date.now()
	) {
		return 'EXPIRED';
	}
	if (status === 'CLAIMED' || status === 'PROCESSING') return 'PENDING';
	return status;
}

export async function GET(req: Request) {
	try {
		const url = new URL(req.url);
		const challengeId = normalizeChallengeId(url.searchParams.get('challengeId'));
		if (!challengeId) return jsonError('challengeId is required', 400);

		const challenge = await prisma.accuraRegistrationHandoff.findFirst({
			where: {
				OR: [{ challengeId }, { tokenId: challengeId }],
			},
			orderBy: { createdAt: 'desc' },
		});

		if (!challenge) {
			return Response.json({
				ok: true,
				challengeId,
				status: 'PENDING',
			});
		}

		const status = publicStatus(challenge);
		return Response.json({
			ok: true,
			challengeId: challenge.challengeId || challenge.tokenId,
			status,
			signaturaId: status === 'APPROVED' ? challenge.signaturaId : null,
			verificationToken:
				status === 'APPROVED' ? challenge.verificationToken || null : null,
			approvedAt:
				status === 'APPROVED' && challenge.approvedAt
					? new Date(challenge.approvedAt).toISOString()
					: null,
			flowType: challenge.flowType || 'cross_device_qr',
			originDevice: challenge.originDevice || 'desktop',
			expiresAt: challenge.expiresAt
				? new Date(challenge.expiresAt).toISOString()
				: null,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to load Signatura challenge status'),
			400,
		);
	}
}
