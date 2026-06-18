import crypto from 'crypto';
import { prisma } from './prisma';

const RP_NAME = 'Signatura';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function isLocalHost(host: string) {
	return host.startsWith('localhost') || host.startsWith('127.0.0.1');
}

function getHost(req: Request) {
	return req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
}

function getRpID(req: Request) {
	const host = getHost(req).split(':')[0];
	return host || 'localhost';
}

function getOrigin(req: Request) {
	const host = getHost(req);
	const forwardedProto = req.headers.get('x-forwarded-proto');
	const proto = forwardedProto || (isLocalHost(host) ? 'http' : 'https');
	return `${proto}://${host}`;
}

function assertSecureWebAuthnRequest(req: Request) {
	const host = getHost(req);
	if (isLocalHost(host)) return;

	const forwardedProto = String(req.headers.get('x-forwarded-proto') || '')
		.split(',')[0]
		.trim()
		.toLowerCase();
	if (forwardedProto === 'https') return;
	if (String(req.headers.get('x-forwarded-ssl') || '').toLowerCase() === 'on') {
		return;
	}

	const cfVisitor = req.headers.get('cf-visitor');
	if (cfVisitor && cfVisitor.includes('https')) return;

	// ngrok and similar tunnels sometimes omit x-forwarded-proto on API requests.
	const hostname = host.split(':')[0].toLowerCase();
	if (hostname.endsWith('.ngrok-free.dev') || hostname.endsWith('.ngrok-free.app')) {
		return;
	}

	if (forwardedProto === 'http') {
		throw new Error('HTTPS is required for passkey authentication');
	}
}

function getUserAgent(req: Request) {
	return req.headers.get('user-agent') || 'Unknown device';
}

function getIpAddress(req: Request) {
	return (
		req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		req.headers.get('x-real-ip') ||
		null
	);
}

function challengeExpiresAt() {
	return new Date(Date.now() + CHALLENGE_TTL_MS);
}

async function logSecurityEvent(
	req: Request,
	event: string,
	userId?: string | null,
	details?: Record<string, unknown>,
) {
	await prisma.securityEventLog.create({
		data: {
			id: crypto.randomUUID(),
			userId: userId || null,
			event,
			ipAddress: getIpAddress(req),
			userAgent: getUserAgent(req),
			details: details || {},
		},
	});
}

async function consumeChallenge(options: {
	challenge: string;
	type: string;
	userId?: string | null;
}) {
	const now = new Date();
	const record = await prisma.authChallenge.findFirst({
		where: {
			challenge: options.challenge,
			type: options.type,
			userId: options.userId || undefined,
			usedAt: null,
			expiresAt: {
				gt: now,
			},
		},
	});

	if (!record) return null;

	await prisma.authChallenge.update({
		where: { id: record.id },
		data: { usedAt: now },
	});

	return record;
}

function hashRecoveryCode(code: string) {
	return crypto
		.createHmac(
			'sha256',
			process.env.RECOVERY_CODE_SECRET ||
				process.env.SESSION_SECRET ||
				'development-only-recovery-secret-change-me',
		)
		.update(code)
		.digest('hex');
}

function hashActivationToken(token: string) {
	return crypto
		.createHmac(
			'sha256',
			process.env.ACTIVATION_TOKEN_SECRET ||
				process.env.SESSION_SECRET ||
				'development-only-activation-secret-change-me',
		)
		.update(token)
		.digest('hex');
}

function createActivationToken() {
	return crypto.randomBytes(32).toString('base64url');
}

function createRecoveryCode() {
	const left = crypto.randomBytes(4).toString('hex').toUpperCase();
	const right = crypto.randomBytes(4).toString('hex').toUpperCase();
	return `SGN-${left}-${right}`;
}

function makeRecoveryCodes(count = 10) {
	return Array.from({ length: count }, () => createRecoveryCode());
}

export {
	CHALLENGE_TTL_MS,
	RP_NAME,
	assertSecureWebAuthnRequest,
	challengeExpiresAt,
	consumeChallenge,
	getOrigin,
	getRpID,
	getUserAgent,
	hashActivationToken,
	hashRecoveryCode,
	createActivationToken,
	logSecurityEvent,
	makeRecoveryCodes,
};
