import { prisma } from '@/lib/prisma';
import { jsonError } from '@/lib/api';
import { logAuthAudit } from '@/lib/auth/authAudit';
import { authenticateApplication, decryptSecret, generateCode, tokenHash } from '@/lib/authenticator';

export async function POST(request) {
	const body = await request.json();
	const applicationId = String(body.applicationId || '');
	const application = await authenticateApplication(request, applicationId);
	if (!application) return jsonError('Invalid application credentials', 401);
	const challenge = await prisma.authenticatorChallenge.findFirst({ where: { tokenHash: tokenHash(body.challengeToken || ''), applicationId, status: 'pending', expiresAt: { gt: new Date() } } });
	if (!challenge) return jsonError('Challenge is invalid or expired', 400);
	const enrollment = await prisma.authenticatorEnrollment.findUnique({ where: { applicationId_identityId: { applicationId, identityId: challenge.identityId } } });
	const valid = Boolean(enrollment && enrollment.status === 'active' && generateCode(decryptSecret(enrollment.secretCiphertext), applicationId, challenge.identityId, challenge.id) === String(body.code || '').replace(/\s/g, ''));
	await logAuthAudit(request, valid ? 'authenticator_login_success' : 'authenticator_login_failed', { userId: challenge.identityId, result: valid ? 'success' : 'failed', details: { applicationId, challengeId: challenge.id } });
	if (!valid) return jsonError('Invalid authenticator code', 401);
	await prisma.authenticatorChallenge.update({ where: { id: challenge.id }, data: { status: 'verified', verifiedAt: new Date() } });
	return Response.json({ verified: true, identityId: challenge.identityId });
}
