import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { verifyTrustedDeviceBinding } from '@/lib/trustedDeviceBinding';

const PERIOD_SECONDS = 30;
const CODE_DIGITS = 6;

function keyMaterial() {
	const configured = process.env.AUTHENTICATOR_ENCRYPTION_KEY;
	if (process.env.NODE_ENV === 'production' && !configured) {
		throw new Error('AUTHENTICATOR_ENCRYPTION_KEY is required');
	}
	return crypto.createHash('sha256').update(configured || process.env.SESSION_SECRET || 'development-authenticator-key').digest();
}

function encryptSecret(secret) {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', keyMaterial(), iv);
	const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
	return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

function decryptSecret(envelope) {
	const [version, iv, tag, ciphertext] = String(envelope).split('.');
	if (version !== 'v1' || !iv || !tag || !ciphertext) throw new Error('Invalid authenticator secret');
	const decipher = crypto.createDecipheriv('aes-256-gcm', keyMaterial(), Buffer.from(iv, 'base64url'));
	decipher.setAuthTag(Buffer.from(tag, 'base64url'));
	return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]);
}

function tokenHash(value) {
	return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function clientSecretHash(value) {
	return crypto.createHmac('sha256', process.env.AUTHENTICATOR_CLIENT_PEPPER || process.env.SESSION_SECRET || 'development-client-pepper').update(String(value)).digest('hex');
}

function safeEqual(left, right) {
	const a = Buffer.from(String(left || ''));
	const b = Buffer.from(String(right || ''));
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function requireTrustedDevice(userId, deviceBindingSecret) {
	if (!deviceBindingSecret) return null;
	const devices = await prisma.trustedDevice.findMany({ where: { userId, isTrusted: true, removedAt: null, status: 'active' } });
	return devices.find((device) => verifyTrustedDeviceBinding(device, { userId, deviceBindingSecret })) || null;
}

function generateCode(secret, applicationId, identityId, challengeId = '', now = Date.now()) {
	const counter = Math.floor(now / 1000 / PERIOD_SECONDS);
	const message = `${applicationId}:${identityId}:${challengeId}:${counter}`;
	const digest = crypto.createHmac('sha256', secret).update(message).digest();
	const offset = digest[digest.length - 1] & 15;
	const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** CODE_DIGITS;
	return String(binary).padStart(CODE_DIGITS, '0');
}

function codeTiming(now = Date.now()) {
	const seconds = Math.floor(now / 1000);
	return { expiresIn: PERIOD_SECONDS - (seconds % PERIOD_SECONDS), period: PERIOD_SECONDS };
}

async function authenticateApplication(request, applicationId) {
	const application = await prisma.authenticatorApplication.findUnique({ where: { applicationId } });
	if (!application || application.status !== 'active' || !application.clientSecretHash) return null;
	const authorization = request.headers.get('authorization') || '';
	const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
	return supplied && safeEqual(clientSecretHash(supplied), application.clientSecretHash) ? application : null;
}

export { PERIOD_SECONDS, authenticateApplication, clientSecretHash, codeTiming, decryptSecret, encryptSecret, generateCode, requireTrustedDevice, tokenHash };
