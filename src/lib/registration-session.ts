import { prisma } from '@/lib/prisma';
import {
	PENDING_REGISTRATION_STATUSES,
	REGISTRATION_STATUSES,
	currentRegistrationStep,
} from '@/lib/registration-status';

export const REGISTRATION_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export function registrationSessionExpiresAt() {
	return new Date(Date.now() + REGISTRATION_SESSION_TTL_MS);
}

function isRenewableRegistrationStep(step: string) {
	return (
		step !== REGISTRATION_STATUSES.COMPLETED &&
		step !== REGISTRATION_STATUSES.CANCELLED &&
		step !== REGISTRATION_STATUSES.EXPIRED
	);
}

export async function touchRegistrationSession(
	registrationSessionId: string,
	userId?: string,
) {
	if (!registrationSessionId && !userId) return;

	await prisma.authChallenge.updateMany({
		where: {
			type: 'REGISTER_ACCOUNT',
			usedAt: null,
			...(registrationSessionId ? { id: registrationSessionId } : {}),
			...(userId ? { userId } : {}),
		},
		data: {
			expiresAt: registrationSessionExpiresAt(),
		},
	});
}

export async function findRegistrationSession({
	registrationSessionId,
	userId,
	renewIfExpired = false,
}: {
	registrationSessionId?: string;
	userId?: string;
	renewIfExpired?: boolean;
}) {
	const session = registrationSessionId
		? await prisma.authChallenge.findFirst({
				where: {
					id: registrationSessionId,
					type: 'REGISTER_ACCOUNT',
					usedAt: null,
				},
			})
		: userId
			? await prisma.authChallenge.findFirst({
					where: {
						userId,
						type: 'REGISTER_ACCOUNT',
						usedAt: null,
					},
					orderBy: { createdAt: 'desc' },
				})
			: null;

	if (!session?.userId) return null;

	if (session.expiresAt > new Date()) {
		return session;
	}

	if (!renewIfExpired) return null;

	const user = await prisma.user.findUnique({
		where: { id: session.userId },
	});
	if (!user) return null;

	const step = currentRegistrationStep(user);
	if (!isRenewableRegistrationStep(step)) return null;

	return prisma.authChallenge.update({
		where: { id: session.id },
		data: { expiresAt: registrationSessionExpiresAt() },
	});
}

export async function ensurePendingRegistrationUser(userId: string) {
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user) return null;

	const step = currentRegistrationStep(user);
	if (
		!PENDING_REGISTRATION_STATUSES.has(step) ||
		step === REGISTRATION_STATUSES.EXPIRED ||
		step === REGISTRATION_STATUSES.CANCELLED
	) {
		return null;
	}

	return user;
}
