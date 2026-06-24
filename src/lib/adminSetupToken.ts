import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import {
	SIGNATURA_ACCOUNT_TYPES,
	getSignaturaAccountType,
} from '@/lib/identity';
import { REGISTRATION_STATUSES } from '@/lib/registration-status';
import { getUserAgent, logSecurityEvent } from '@/lib/webauthn';

export const ADMIN_SETUP_TOKEN_PURPOSE = 'ADMIN_PASSKEY_SETUP';
export const ADMIN_SETUP_TOKEN_TTL_MS = 10 * 60 * 1000;

type AdminSetupTokenRecord = {
	id: string;
	tokenHash: string;
	userId: string;
	purpose: string;
	status: string;
	expiresAt: Date;
	usedAt: Date | null;
	user: {
		id: string;
		signaturaId: string;
		accountStatus: string;
		trustLevel: number;
	};
};

function adminSetupTokenModel(client = prisma) {
	return (
		client as unknown as {
			adminSetupToken: {
				create: (args: { data: Record<string, unknown> }) => Promise<AdminSetupTokenRecord>;
				findUnique: (args: {
					where: { tokenHash: string };
					include?: Record<string, unknown>;
				}) => Promise<AdminSetupTokenRecord | null>;
				findFirst: (args: {
					where: Record<string, unknown>;
					include?: Record<string, unknown>;
					orderBy?: Record<string, unknown>;
				}) => Promise<AdminSetupTokenRecord | null>;
				update: (args: {
					where: { id: string };
					data: Record<string, unknown>;
				}) => Promise<AdminSetupTokenRecord>;
				updateMany: (args: {
					where: Record<string, unknown>;
					data: Record<string, unknown>;
				}) => Promise<{ count: number }>;
			};
		}
	).adminSetupToken;
}

function adminSetupSecret() {
	return (
		process.env.ADMIN_SETUP_TOKEN_SECRET ||
		process.env.SESSION_SECRET ||
		process.env.ADMIN_PROVISIONING_SECRET ||
		'development-only-admin-setup-token-secret'
	);
}

export function createAdminSetupRawToken() {
	return crypto.randomBytes(32).toString('base64url');
}

export function hashAdminSetupToken(token: string) {
	return crypto
		.createHmac('sha256', adminSetupSecret())
		.update(token)
		.digest('hex');
}

export function hashAdminSetupIp(req: Request) {
	const ip =
		req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		req.headers.get('x-real-ip') ||
		'';
	if (!ip) return null;
	return crypto
		.createHmac('sha256', adminSetupSecret())
		.update(ip)
		.digest('hex');
}

export function adminSetupTokenExpiresAt() {
	return new Date(Date.now() + ADMIN_SETUP_TOKEN_TTL_MS);
}

export function adminSetupPublicUser(user: AdminSetupTokenRecord['user']) {
	return {
		id: user.id,
		signaturaId: user.signaturaId,
		accountStatus: user.accountStatus,
		trustLevel: user.trustLevel,
	};
}

export async function createAdminSetupTokenRecord({
	req,
	userId,
	createdById = null,
}: {
	req: Request;
	userId: string;
	createdById?: string | null;
}) {
	const rawToken = createAdminSetupRawToken();
	const tokenHash = hashAdminSetupToken(rawToken);
	const expiresAt = adminSetupTokenExpiresAt();
	const model = adminSetupTokenModel();

	await model.updateMany({
		where: {
			userId,
			purpose: ADMIN_SETUP_TOKEN_PURPOSE,
			status: 'ACTIVE',
			usedAt: null,
		},
		data: { status: 'REVOKED' },
	});

	const record = await model.create({
		data: {
			tokenHash,
			userId,
			purpose: ADMIN_SETUP_TOKEN_PURPOSE,
			status: 'ACTIVE',
			expiresAt,
			createdById,
			userAgent: getUserAgent(req),
			ipHash: hashAdminSetupIp(req),
		},
	});

	await logSecurityEvent(req, 'admin_setup_token_created', userId, {
		tokenId: record.id,
		expiresAt: expiresAt.toISOString(),
	});

	return { rawToken, record, expiresAt };
}

export async function validateAdminSetupToken(
	req: Request,
	token: string,
	options: { auditEvent?: string; allowUsed?: boolean } = {},
) {
	const trimmedToken = String(token || '').trim();
	if (!trimmedToken) {
		await logSecurityEvent(req, 'admin_setup_token_failed', null, {
			reason: 'missing_token',
		});
		return { ok: false as const, status: 400, reason: 'invalid', message: 'Invalid setup link.' };
	}

	const model = adminSetupTokenModel();
	const tokenHash = hashAdminSetupToken(trimmedToken);
	const record = await model.findUnique({
		where: { tokenHash },
		include: { user: true },
	});

	if (!record || record.purpose !== ADMIN_SETUP_TOKEN_PURPOSE) {
		await logSecurityEvent(req, 'admin_setup_token_failed', null, {
			reason: 'invalid_token',
		});
		return { ok: false as const, status: 404, reason: 'invalid', message: 'Invalid setup link.' };
	}

	const userId = record.userId;
	if (record.usedAt || record.status === 'USED') {
		await logSecurityEvent(req, 'admin_setup_token_failed', userId, {
			tokenId: record.id,
			reason: 'used_token',
		});
		return {
			ok: false as const,
			status: 409,
			reason: 'used',
			message: 'This setup QR was already used.',
		};
	}

	if (record.status !== 'ACTIVE') {
		await logSecurityEvent(req, 'admin_setup_token_failed', userId, {
			tokenId: record.id,
			reason: String(record.status || '').toLowerCase() || 'inactive_token',
		});
		return { ok: false as const, status: 409, reason: 'invalid', message: 'Invalid setup link.' };
	}

	if (record.expiresAt <= new Date()) {
		await model.update({ where: { id: record.id }, data: { status: 'EXPIRED' } });
		await logSecurityEvent(req, 'admin_setup_token_failed', userId, {
			tokenId: record.id,
			reason: 'expired_token',
		});
		return {
			ok: false as const,
			status: 410,
			reason: 'expired',
			message: 'This setup QR has expired.',
		};
	}

	if (
		getSignaturaAccountType(record.user.signaturaId) !== SIGNATURA_ACCOUNT_TYPES.ADMIN
	) {
		await logSecurityEvent(req, 'admin_setup_token_failed', userId, {
			tokenId: record.id,
			reason: 'not_admin_account',
		});
		return { ok: false as const, status: 403, reason: 'mismatch', message: 'Invalid setup link.' };
	}

	if (
		record.user.accountStatus === 'active' ||
		record.user.accountStatus === REGISTRATION_STATUSES.COMPLETED ||
		record.user.trustLevel >= 2
	) {
		await logSecurityEvent(req, 'admin_setup_token_failed', userId, {
			tokenId: record.id,
			reason: 'account_already_active',
		});
		return {
			ok: false as const,
			status: 409,
			reason: 'used',
			message: 'This admin account is already active.',
		};
	}

	await logSecurityEvent(
		req,
		options.auditEvent || 'admin_setup_token_validated',
		userId,
		{
			tokenId: record.id,
			expiresAt: record.expiresAt.toISOString(),
		},
	);

	return { ok: true as const, record };
}

export { adminSetupTokenModel };
