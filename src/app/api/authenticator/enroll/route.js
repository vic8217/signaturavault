import crypto from 'crypto';
import { requireSession, hasRecentVerification } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { jsonError } from '@/lib/api';
import { encryptSecret, requireTrustedDevice } from '@/lib/authenticator';

export async function POST(request) {
	const session = await requireSession();
	if (!session || session.accountStatus !== 'active') return jsonError('Authentication required', 401);
	if ((session.trustLevel || 0) < 2) return jsonError('Zero Trust Level 2 is required', 403);
	const body = await request.json();
	const device = await requireTrustedDevice(session.userId, body.deviceBindingSecret);
	if (!device) return jsonError('Trusted device verification required', 403);
	const application = await prisma.authenticatorApplication.findUnique({ where: { applicationId: String(body.applicationId || '') } });
	if (!application || application.status !== 'active') return jsonError('Application is not approved', 404);
	if (application.requireBiometric && !hasRecentVerification(session)) return jsonError('Passkey verification required', 428);
	await prisma.authenticatorEnrollment.upsert({
		where: { applicationId_identityId: { applicationId: application.applicationId, identityId: session.userId } },
		create: { applicationId: application.applicationId, identityId: session.userId, secretCiphertext: encryptSecret(crypto.randomBytes(32)), status: 'active' },
		update: { status: 'active' },
	});
	return Response.json({ ok: true, applicationId: application.applicationId }, { status: 201 });
}
