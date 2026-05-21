import crypto from 'crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { jsonError } from '@/lib/api';
import { ROLE_COOKIE, ROLES } from '@/lib/roles';
import {
	createActivationToken,
	hashActivationToken,
	logSecurityEvent,
} from '@/lib/webauthn';

const DELIVERY_CHANNELS = new Set([
	'VIBER',
	'MESSENGER',
	'WHATSAPP',
	'SMS',
	'SECURE_ENTERPRISE_CHANNEL',
]);

function activationUrl(req: Request, token: string) {
	const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
	const proto =
		req.headers.get('x-forwarded-proto') ||
		(host?.startsWith('localhost') ? 'http' : 'https');
	return `${proto}://${host}/issuer-portal/activate?token=${token}`;
}

export async function POST(req: Request) {
	try {
		const cookieStore = await cookies();
		const role = cookieStore.get(ROLE_COOKIE)?.value;

		if (
			role !== ROLES.SIGNATURA_ADMIN &&
			role !== ROLES.SIGNATURA_STAFF &&
			role !== ROLES.ISSUER_ADMIN
		) {
			return jsonError('Issuer admin or Signatura admin role required', 403);
		}

		const body = await req.json();
		const tenantId = String(body.tenantId || '').trim();
		const issuerId = String(body.issuerId || '').trim() || null;
		const email = String(body.email || '').trim().toLowerCase();
		const inviteRole = String(body.role || 'ISSUER_STAFF').trim();
		const deliveryChannel = String(body.deliveryChannel || '').trim().toUpperCase();
		const recipient = String(body.recipient || '').trim();
		const expiresInHours = Number(body.expiresInHours || 72);

		if (
			!tenantId ||
			!email ||
			!recipient ||
			!DELIVERY_CHANNELS.has(deliveryChannel)
		) {
			return jsonError(
				'tenantId, email, recipient, and a supported deliveryChannel are required',
			);
		}

		const token = createActivationToken();
		const tokenHash = hashActivationToken(token);
		const expiresAt = new Date(
			Date.now() +
				Math.max(1, Math.min(expiresInHours, 168)) * 60 * 60 * 1000,
		);

		const invitation = await prisma.$transaction(async (tx) => {
			const issuerUser = await tx.issuerUser.create({
				data: {
					id: crypto.randomUUID(),
					tenantId,
					issuerId,
					email,
					role: inviteRole,
					status: 'invited',
					invitedAt: new Date(),
				},
			});

			return tx.issuerInvitation.create({
				data: {
					id: crypto.randomUUID(),
					tenantId,
					issuerId,
					issuerUserId: issuerUser.id,
					email,
					role: inviteRole,
					deliveryChannel,
					recipient,
					tokenHash,
					expiresAt,
				},
			});
		});

		await logSecurityEvent(req, 'issuer_invitation_created', null, {
			invitationId: invitation.id,
			tenantId,
			issuerId,
			deliveryChannel,
			recipient,
			securityNotice:
				'Messaging platform is a delivery channel only, not proof of identity. No passwords or recovery codes were sent.',
		});

		return Response.json({
			invitationId: invitation.id,
			deliveryChannel,
			expiresAt,
			activationUrl: activationUrl(req, token),
			message:
				'Send only this activation link through the selected channel. Do not send passwords or recovery codes.',
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : '';
		const isDatabaseUnavailable =
			message.includes("Can't reach database server") ||
			message.includes('ECONNREFUSED') ||
			message.includes('Connection terminated') ||
			message.includes('connect ECONNREFUSED');

		return jsonError(
			isDatabaseUnavailable
				? 'Issuer was registered, but the activation invite could not be created because PostgreSQL is not available. Start PostgreSQL and run the Prisma migration before creating issuer activation links.'
				: 'Issuer was registered, but the activation invite could not be created. Please try again.',
			500,
		);
	}
}
