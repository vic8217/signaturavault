import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export const LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export const LOGIN_CHALLENGE_STATUS = {
	PENDING: 'PENDING',
	APPROVED: 'APPROVED',
	EXPIRED: 'EXPIRED',
	DENIED: 'DENIED',
	CONSUMED: 'CONSUMED',
};

const SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function getChallengeSecret() {
	return (
		process.env.LOGIN_CHALLENGE_SECRET?.trim() ||
		process.env.SESSION_SECRET?.trim() ||
		process.env.AUTH_SECRET?.trim() ||
		'development-only-login-challenge-secret-change-me'
	);
}

function hashChallengeValue(value) {
	return crypto
		.createHmac('sha256', getChallengeSecret())
		.update(String(value ?? ''))
		.digest('hex');
}

function generateShortCode(length = 6) {
	let code = '';
	for (let index = 0; index < length; index += 1) {
		code += SHORT_CODE_ALPHABET[crypto.randomInt(0, SHORT_CODE_ALPHABET.length)];
	}
	return code;
}

function createBrowserSecret() {
	return crypto.randomBytes(32).toString('base64url');
}

function createApprovalToken() {
	return `lgnappr_${crypto.randomBytes(32).toString('base64url')}`;
}

export async function expireStaleLoginChallenges({ userId } = {}) {
	await prisma.trustedDeviceLoginChallenge.updateMany({
		where: {
			...(userId ? { userId } : {}),
			status: LOGIN_CHALLENGE_STATUS.PENDING,
			expiresAt: { lt: new Date() },
		},
		data: { status: LOGIN_CHALLENGE_STATUS.EXPIRED },
	});
}

export async function createTrustedDeviceLoginChallenge({
	userId,
	nextPath = '/signatura/dashboard',
	browserUserAgent = null,
}) {
	await expireStaleLoginChallenges({ userId });
	await prisma.trustedDeviceLoginChallenge.updateMany({
		where: {
			userId,
			status: LOGIN_CHALLENGE_STATUS.PENDING,
		},
		data: { status: LOGIN_CHALLENGE_STATUS.EXPIRED },
	});

	const browserSecret = createBrowserSecret();
	let shortCode = generateShortCode();
	for (let attempt = 0; attempt < 4; attempt += 1) {
		const existing = await prisma.trustedDeviceLoginChallenge.findFirst({
			where: {
				shortCode,
				status: LOGIN_CHALLENGE_STATUS.PENDING,
			},
		});
		if (!existing) break;
		shortCode = generateShortCode();
	}

	const challenge = await prisma.trustedDeviceLoginChallenge.create({
		data: {
			userId,
			shortCode,
			browserSecretHash: hashChallengeValue(browserSecret),
			status: LOGIN_CHALLENGE_STATUS.PENDING,
			browserUserAgent,
			nextPath: nextPath?.startsWith('/') ? nextPath : '/signatura/dashboard',
			expiresAt: new Date(Date.now() + LOGIN_CHALLENGE_TTL_MS),
		},
	});

	return {
		challenge,
		browserSecret,
	};
}

export async function lookupTrustedDeviceLoginChallenge({
	challengeId,
	shortCode,
}) {
	await expireStaleLoginChallenges();
	const challenge = await prisma.trustedDeviceLoginChallenge.findFirst({
		where: {
			id: challengeId,
			shortCode: String(shortCode ?? '').trim().toUpperCase(),
			status: LOGIN_CHALLENGE_STATUS.PENDING,
			expiresAt: { gt: new Date() },
		},
		include: {
			user: {
				select: { id: true, signaturaId: true },
			},
		},
	});
	if (!challenge) return null;
	return {
		id: challenge.id,
		shortCode: challenge.shortCode,
		userId: challenge.userId,
		signaturaId: challenge.user.signaturaId,
		status: challenge.status,
		expiresAt: challenge.expiresAt,
	};
}

function verifyBrowserSecret(challenge, browserSecret) {
	const provided = hashChallengeValue(browserSecret);
	const expected = String(challenge.browserSecretHash ?? '');
	const left = Buffer.from(provided);
	const right = Buffer.from(expected);
	return (
		left.length === right.length && crypto.timingSafeEqual(left, right)
	);
}

export async function pollTrustedDeviceLoginChallenge({
	challengeId,
	browserSecret,
}) {
	await expireStaleLoginChallenges();
	const challenge = await prisma.trustedDeviceLoginChallenge.findUnique({
		where: { id: challengeId },
	});
	if (!challenge || !verifyBrowserSecret(challenge, browserSecret)) {
		const error = new Error('Login challenge not found or expired.');
		error.status = 404;
		throw error;
	}
	if (challenge.expiresAt <= new Date()) {
		if (challenge.status === LOGIN_CHALLENGE_STATUS.PENDING) {
			await prisma.trustedDeviceLoginChallenge.update({
				where: { id: challenge.id },
				data: { status: LOGIN_CHALLENGE_STATUS.EXPIRED },
			});
		}
		const error = new Error('Login challenge not found or expired.');
		error.status = 404;
		throw error;
	}

	if (challenge.status === LOGIN_CHALLENGE_STATUS.APPROVED) {
		let approvalToken = null;
		if (!challenge.approvalTokenHash) {
			approvalToken = createApprovalToken();
			await prisma.trustedDeviceLoginChallenge.update({
				where: { id: challenge.id },
				data: {
					approvalTokenHash: hashChallengeValue(approvalToken),
				},
			});
		}
		return {
			status: LOGIN_CHALLENGE_STATUS.APPROVED,
			approvalToken,
			nextPath: challenge.nextPath || '/signatura/dashboard',
			signaturaId: (
				await prisma.user.findUnique({
					where: { id: challenge.userId },
					select: { signaturaId: true },
				})
			)?.signaturaId,
		};
	}

	return { status: challenge.status };
}

export async function approveTrustedDeviceLoginChallenge({
	challengeId,
	shortCode,
	approverUserId,
	credentialId,
	trustedDeviceId,
}) {
	await expireStaleLoginChallenges();
	const challenge = await prisma.trustedDeviceLoginChallenge.findFirst({
		where: {
			id: challengeId,
			shortCode: String(shortCode ?? '').trim().toUpperCase(),
			status: LOGIN_CHALLENGE_STATUS.PENDING,
			expiresAt: { gt: new Date() },
		},
	});
	if (!challenge) {
		const error = new Error('Login challenge not found or expired.');
		error.status = 404;
		throw error;
	}
	if (challenge.userId !== approverUserId) {
		const error = new Error(
			'This Signatura account does not match the browser login request.',
		);
		error.status = 403;
		throw error;
	}

	const updated = await prisma.trustedDeviceLoginChallenge.update({
		where: { id: challenge.id },
		data: {
			status: LOGIN_CHALLENGE_STATUS.APPROVED,
			approvedAt: new Date(),
			approvingDeviceId: trustedDeviceId || null,
			approvingCredentialId: credentialId || null,
		},
	});

	return updated;
}

export async function consumeTrustedDeviceLoginChallenge({
	challengeId,
	browserSecret,
	approvalToken,
}) {
	await expireStaleLoginChallenges();
	const challenge = await prisma.trustedDeviceLoginChallenge.findUnique({
		where: { id: challengeId },
	});
	if (!challenge || !verifyBrowserSecret(challenge, browserSecret)) {
		const error = new Error('Login challenge not found or expired.');
		error.status = 404;
		throw error;
	}
	if (challenge.expiresAt <= new Date()) {
		const error = new Error('Login challenge not found or expired.');
		error.status = 404;
		throw error;
	}
	if (
		challenge.consumedAt ||
		challenge.status === LOGIN_CHALLENGE_STATUS.CONSUMED
	) {
		const error = new Error('Login approval was already used.');
		error.status = 409;
		throw error;
	}
	if (challenge.status !== LOGIN_CHALLENGE_STATUS.APPROVED) {
		const error = new Error('Trusted device approval is not ready yet.');
		error.status = 409;
		throw error;
	}

	const expectedTokenHash = String(challenge.approvalTokenHash ?? '');
	const providedTokenHash = hashChallengeValue(approvalToken);
	const left = Buffer.from(providedTokenHash);
	const right = Buffer.from(expectedTokenHash);
	if (
		!expectedTokenHash ||
		left.length !== right.length ||
		!crypto.timingSafeEqual(left, right)
	) {
		const error = new Error('Login approval token is invalid.');
		error.status = 403;
		throw error;
	}

	const user = await prisma.user.findUnique({
		where: { id: challenge.userId },
	});
	if (!user) {
		const error = new Error('Signatura identity is required');
		error.status = 404;
		throw error;
	}

	const consumed = await prisma.trustedDeviceLoginChallenge.update({
		where: { id: challenge.id },
		data: {
			status: LOGIN_CHALLENGE_STATUS.CONSUMED,
			consumedAt: new Date(),
		},
	});

	return {
		challenge: consumed,
		user,
		nextPath: challenge.nextPath || '/signatura/dashboard',
		approvingCredentialId: challenge.approvingCredentialId,
	};
}

export function buildRemoteLoginQrUrl(origin, challengeId, shortCode) {
	const url = new URL('/login/remote-approve', origin);
	url.searchParams.set('cid', challengeId);
	url.searchParams.set('code', shortCode);
	return url.toString();
}
