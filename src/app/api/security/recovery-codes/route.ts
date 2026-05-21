import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError } from '@/lib/api';
import { hasRecentVerification, requireSession } from '@/lib/session';
import {
	hashRecoveryCode,
	logSecurityEvent,
	makeRecoveryCodes,
} from '@/lib/webauthn';

export async function GET() {
	const session = await requireSession();
	if (!session) return jsonError('Authentication required', 401);

	const codes = await prisma.recoveryCode.findMany({
		where: { userId: session.userId },
		orderBy: { createdAt: 'asc' },
		select: {
			id: true,
			codePrefix: true,
			createdAt: true,
			usedAt: true,
		},
	});

	return Response.json({ codes });
}

export async function POST(req: Request) {
	const session = await requireSession();
	if (!session) return jsonError('Authentication required', 401);
	if (!hasRecentVerification(session)) {
		return jsonError('Recent biometric/passkey verification required', 403);
	}

	const recoveryCodes = makeRecoveryCodes();

	await prisma.$transaction([
		prisma.recoveryCode.deleteMany({ where: { userId: session.userId } }),
		prisma.recoveryCode.createMany({
			data: recoveryCodes.map((code) => ({
				id: crypto.randomUUID(),
				userId: session.userId,
				codeHash: hashRecoveryCode(code),
				codePrefix: code.slice(0, 8),
			})),
		}),
	]);

	await logSecurityEvent(req, 'recovery_codes_rotated', session.userId, {
		shownOnce: true,
	});

	return Response.json({ recoveryCodes });
}
