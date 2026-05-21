import { prisma } from '@/lib/prisma';
import { jsonError } from '@/lib/api';
import { requireSession } from '@/lib/session';

export async function GET() {
	const session = await requireSession();
	if (!session) return jsonError('Authentication required', 401);

	const devices = await prisma.trustedDevice.findMany({
		where: { userId: session.userId, removedAt: null },
		orderBy: { createdAt: 'asc' },
		select: {
			id: true,
			deviceName: true,
			userAgent: true,
			createdAt: true,
			lastUsedAt: true,
			isTrusted: true,
		},
	});

	return Response.json({ devices });
}
