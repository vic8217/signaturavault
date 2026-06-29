import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';

function normalizeChallengeId(value: unknown) {
	return String(value || '').trim().slice(0, 200);
}

function normalizeSignaturaId(value: unknown) {
	return String(value || '').trim().toUpperCase().slice(0, 120);
}

function normalizeVerificationToken(value: unknown) {
	return String(value || '').trim();
}

export async function POST(req: Request) {
	try {
		const body = await req.json().catch(() => ({}));
		const challengeId = normalizeChallengeId(body.challengeId);
		const signaturaId = normalizeSignaturaId(body.signaturaId);
		const verificationToken = normalizeVerificationToken(body.verificationToken);
		const status = String(body.status || 'APPROVED').trim().toUpperCase();
		const requestedApprovedAt = body.approvedAt
			? new Date(String(body.approvedAt))
			: null;

		if (!challengeId) return jsonError('challengeId is required', 400);
		if (status !== 'APPROVED') return jsonError('status must be APPROVED', 400);
		if (!signaturaId) return jsonError('signaturaId is required', 400);

		console.info('[accura.signatura.challenge.approve.received]', {
			challengeId,
			signaturaId,
			hasVerificationToken: Boolean(verificationToken),
		});

		const existingChallenge = await prisma.accuraRegistrationHandoff.findFirst({
			where: { challengeId },
			orderBy: { createdAt: 'desc' },
		});

		if (!existingChallenge) {
			console.warn('[accura.signatura.challenge.approve.missing]', {
				challengeId,
			});
			return jsonError('ACCURA challenge was not found', 404);
		}

		const approvedAt =
			requestedApprovedAt && Number.isFinite(requestedApprovedAt.getTime())
				? requestedApprovedAt
				: new Date();
		const updated = await prisma.accuraRegistrationHandoff.updateMany({
			where: { challengeId },
			data: {
				status: 'APPROVED',
				signaturaId,
				verificationToken,
				approvedAt,
				completedAt: approvedAt,
			},
		});

		console.info('[accura.signatura.challenge.approve.saved]', {
			challengeId,
			signaturaId,
			updatedCount: updated.count,
			status: 'APPROVED',
		});

		return Response.json({
			ok: true,
			challengeId,
			status: 'APPROVED',
			signaturaId,
			verificationToken,
			approvedAt: approvedAt.toISOString(),
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to approve Signatura challenge'),
			400,
		);
	}
}
