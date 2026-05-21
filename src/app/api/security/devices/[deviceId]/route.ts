import { prisma } from '@/lib/prisma';
import { jsonError } from '@/lib/api';
import { hasRecentVerification, requireSession } from '@/lib/session';
import { logSecurityEvent } from '@/lib/webauthn';

export async function DELETE(
	req: Request,
	{ params }: { params: Promise<{ deviceId: string }> },
) {
	const session = await requireSession();
	if (!session) return jsonError('Authentication required', 401);
	if (!hasRecentVerification(session)) {
		return jsonError('Recent biometric/passkey verification required', 403);
	}

	const { deviceId } = await params;
	const device = await prisma.trustedDevice.findFirst({
		where: { id: deviceId, userId: session.userId, removedAt: null },
	});

	if (!device) return jsonError('Trusted device not found', 404);

	await prisma.$transaction([
		prisma.trustedDevice.update({
			where: { id: device.id },
			data: { removedAt: new Date(), isTrusted: false },
		}),
		...(device.credentialId
			? [
					prisma.webAuthnCredential.updateMany({
						where: {
							userId: session.userId,
							credentialId: device.credentialId,
						},
						data: { isTrusted: false },
					}),
				]
			: []),
	]);

	await logSecurityEvent(req, 'trusted_device_removed', session.userId, {
		deviceId,
		deviceName: device.deviceName,
	});

	return Response.json({ ok: true });
}
