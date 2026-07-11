import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError } from '@/lib/api';
import { authenticateApplication, tokenHash } from '@/lib/authenticator';

export async function POST(request) {
	const body = await request.json();
	const applicationId = String(body.applicationId || '');
	const application = await authenticateApplication(request, applicationId);
	if (!application) return jsonError('Invalid application credentials', 401);
	const identity = await prisma.user.findUnique({ where: { signaturaId: String(body.identityId || '').trim().toUpperCase() }, select: { id: true } });
	if (!identity) return jsonError('Identity is not enrolled', 404);
	const enrollment = await prisma.authenticatorEnrollment.findUnique({ where: { applicationId_identityId: { applicationId, identityId: identity.id } } });
	if (!enrollment || enrollment.status !== 'active') return jsonError('Identity is not enrolled', 404);
	const challengeToken = crypto.randomBytes(32).toString('base64url');
	const challenge = await prisma.authenticatorChallenge.create({ data: { tokenHash: tokenHash(challengeToken), applicationId, identityId: identity.id, expiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
	return Response.json({ challengeToken, expiresAt: challenge.expiresAt }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}
