import { requireSession, hasRecentVerification } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { jsonError } from '@/lib/api';
import { logAuthAudit } from '@/lib/auth/authAudit';
import { codeTiming, decryptSecret, generateCode, requireTrustedDevice, tokenHash } from '@/lib/authenticator';

export async function POST(request) {
	const session = await requireSession();
	if (!session || session.accountStatus !== 'active') return jsonError('Authentication required', 401);
	if ((session.trustLevel || 0) < 2) return jsonError('Zero Trust Level 2 is required', 403);
	const body = await request.json();
	const device = await requireTrustedDevice(session.userId, body.deviceBindingSecret);
	if (!device) return jsonError('Trusted device verification required', 403);
	const enrollment = await prisma.authenticatorEnrollment.findUnique({
		where: { applicationId_identityId: { applicationId: String(body.applicationId || ''), identityId: session.userId } },
		include: { application: true },
	});
	if (!enrollment || enrollment.status !== 'active' || enrollment.application.status !== 'active') return jsonError('Active enrollment not found', 404);
	if (enrollment.application.requireBiometric && !hasRecentVerification(session)) return jsonError('Passkey verification required', 428);
	let challenge = null;
	if (body.challengeToken) {
		challenge = await prisma.authenticatorChallenge.findFirst({ where: { tokenHash: tokenHash(body.challengeToken), applicationId: enrollment.applicationId, identityId: session.userId, status: 'pending', expiresAt: { gt: new Date() } } });
		if (!challenge) return jsonError('Login challenge is invalid or expired', 400);
	}
	const now = Date.now();
	const code = generateCode(decryptSecret(enrollment.secretCiphertext), enrollment.applicationId, session.userId, challenge?.id || '', now);
	await logAuthAudit(request, 'authenticator_viewed', { userId: session.userId, details: { applicationId: enrollment.applicationId, identityId: session.userId, deviceId: device.id, challengeId: challenge?.id || null } });
	return Response.json({ applicationId: enrollment.applicationId, applicationName: enrollment.application.name, code, generatedAt: new Date(now).toISOString(), ...codeTiming(now) }, { headers: { 'Cache-Control': 'no-store' } });
}
