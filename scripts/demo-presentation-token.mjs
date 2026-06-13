#!/usr/bin/env node
import 'dotenv/config';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const PRESENTATION_SLUG = 'signatura-issuers';

function hashToken(token) {
	return crypto.createHash('sha256').update(token).digest('hex');
}

function tokenEncryptionKey() {
	return crypto
		.createHash('sha256')
		.update(
			process.env.PRESENTATION_TOKEN_ENCRYPTION_SECRET ||
				process.env.SESSION_SECRET ||
				'development-only-presentation-token-secret-change-me',
		)
		.digest();
}

function encryptToken(token) {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', tokenEncryptionKey(), iv);
	const encrypted = Buffer.concat([
		cipher.update(String(token), 'utf8'),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

const adapter = new PrismaPg(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

const token = crypto.randomBytes(32).toString('base64url');
const expiresAt = new Date(
	Date.now() + Number(process.env.PRESENTATION_TOKEN_HOURS || 72) * 60 * 60 * 1000,
);
const baseUrl = process.env.PRESENTATION_BASE_URL || 'http://localhost:3000';

try {
	const link = await prisma.presentationAccessLink.create({
		data: {
			tokenHash: hashToken(token),
			tokenCipher: encryptToken(token),
			tokenPrefix: token.slice(0, 8),
			presentationSlug: PRESENTATION_SLUG,
			viewerName: process.env.PRESENTATION_VIEWER_NAME || 'Local demo viewer',
			viewerEmail: process.env.PRESENTATION_VIEWER_EMAIL || null,
			expiresAt,
			maxViews: process.env.PRESENTATION_MAX_VIEWS
				? Number(process.env.PRESENTATION_MAX_VIEWS)
				: 25,
		},
	});
	const url = new URL('/presentation/signatura-issuers', baseUrl);
	url.searchParams.set('token', token);
	console.log('Created presentation access link');
	console.log(`Token ID: ${link.id}`);
	console.log(`Expires: ${expiresAt.toISOString()}`);
	console.log(`URL: ${url.toString()}`);
} finally {
	await prisma.$disconnect();
}
