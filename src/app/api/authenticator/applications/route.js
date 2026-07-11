import { requireSession } from '@/lib/session';
import { prisma } from '@/lib/prisma';
import { jsonError } from '@/lib/api';
import { requireTrustedDevice } from '@/lib/authenticator';

export async function GET(request) {
	const session = await requireSession();
	if (!session || session.accountStatus !== 'active') return jsonError('Authentication required', 401);
	if ((session.trustLevel || 0) < 2) return jsonError('Zero Trust Level 2 is required', 403);
	const device = await requireTrustedDevice(session.userId, request.headers.get('x-device-binding'));
	if (!device) return jsonError('Trusted device verification required', 403);
	const enrollments = await prisma.authenticatorEnrollment.findMany({
		where: { identityId: session.userId, status: 'active', application: { status: 'active' } },
		select: { createdAt: true, status: true, application: { select: { applicationId: true, name: true, requireBiometric: true } } },
		orderBy: { createdAt: 'asc' },
	});
	const approved = await prisma.authenticatorApplication.findMany({ where: { status: 'active' }, select: { applicationId: true, name: true, requireBiometric: true }, orderBy: { name: 'asc' } });
	return Response.json({ applications: enrollments.map((item) => ({ ...item.application, status: item.status, enrolledAt: item.createdAt })), approved });
}
