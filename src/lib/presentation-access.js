import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { resolvePublicSignaturaOrigin } from '@/lib/publicOrigin';

const SIGNATURA_ISSUERS_PRESENTATION_SLUG = 'signatura-issuers';
const SIGNATURA_ISSUERS_SLIDE_COUNT = 15;

function createPresentationToken() {
	return crypto.randomBytes(32).toString('base64url');
}

function hashPresentationToken(token) {
	return crypto.createHash('sha256').update(String(token || '')).digest('hex');
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

function encryptPresentationToken(token) {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv('aes-256-gcm', tokenEncryptionKey(), iv);
	const encrypted = Buffer.concat([
		cipher.update(String(token), 'utf8'),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

function decryptPresentationToken(tokenCipher) {
	if (!tokenCipher) return '';
	const [ivValue, tagValue, encryptedValue] = String(tokenCipher).split('.');
	if (!ivValue || !tagValue || !encryptedValue) return '';
	const decipher = crypto.createDecipheriv(
		'aes-256-gcm',
		tokenEncryptionKey(),
		Buffer.from(ivValue, 'base64url'),
	);
	decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
	return Buffer.concat([
		decipher.update(Buffer.from(encryptedValue, 'base64url')),
		decipher.final(),
	]).toString('utf8');
}

function publicPresentationLink(link) {
	return {
		id: link.id,
		tokenPrefix: link.tokenPrefix,
		presentationSlug: link.presentationSlug,
		viewerName: link.viewerName || '',
		viewerEmail: link.viewerEmail || '',
		expiresAt: link.expiresAt,
		usedAt: link.usedAt,
		maxViews: link.maxViews,
		viewCount: link.viewCount,
		isRevoked: link.isRevoked,
		createdAt: link.createdAt,
		updatedAt: link.updatedAt,
	};
}

function presentationShareUrl(req, token) {
	const origin =
		req ? resolvePublicSignaturaOrigin(req) : 'http://localhost:3000';
	const url = new URL('/presentation/signatura-issuers', origin);
	url.searchParams.set('token', token);
	return url.toString();
}

function adminPresentationLink(link, req) {
	const base = publicPresentationLink(link);
	const isActive =
		!link.isRevoked &&
		link.expiresAt > new Date() &&
		(link.maxViews === null || link.viewCount < link.maxViews);
	let token = '';
	try {
		token = isActive ? decryptPresentationToken(link.tokenCipher) : '';
	} catch {
		token = '';
	}
	return {
		...base,
		shareUrl: token ? presentationShareUrl(req, token) : '',
	};
}

function getIpAddress(req) {
	return (
		req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		req.headers.get('x-real-ip') ||
		null
	);
}

function getUserAgent(req) {
	return req.headers.get('user-agent') || 'Unknown device';
}

async function createPresentationAccessLink({
	presentationSlug = SIGNATURA_ISSUERS_PRESENTATION_SLUG,
	viewerName = '',
	viewerEmail = '',
	expiresAt,
	maxViews = null,
}) {
	const token = createPresentationToken();
	const link = await prisma.presentationAccessLink.create({
		data: {
			tokenHash: hashPresentationToken(token),
			tokenCipher: encryptPresentationToken(token),
			tokenPrefix: token.slice(0, 8),
			presentationSlug,
			viewerName: String(viewerName || '').trim() || null,
			viewerEmail: String(viewerEmail || '').trim() || null,
			expiresAt,
			maxViews,
		},
	});

	return { token, link };
}

async function validatePresentationAccess({
	token,
	presentationSlug = SIGNATURA_ISSUERS_PRESENTATION_SLUG,
	req,
	incrementView = false,
}) {
	const tokenValue = String(token || '').trim();
	if (!tokenValue) {
		return { ok: false, error: 'Presentation link expired or invalid.' };
	}

	const now = new Date();
	const link = await prisma.presentationAccessLink.findUnique({
		where: { tokenHash: hashPresentationToken(tokenValue) },
	});

	if (
		!link ||
		link.presentationSlug !== presentationSlug ||
		link.expiresAt <= now ||
		link.isRevoked ||
		(link.maxViews !== null && link.viewCount >= link.maxViews)
	) {
		return { ok: false, error: 'Presentation link expired or invalid.' };
	}

	if (!incrementView) {
		return { ok: true, link: publicPresentationLink(link) };
	}

	try {
		const updated = await prisma.$transaction(async (tx) => {
			const fresh = await tx.presentationAccessLink.findUnique({
				where: { id: link.id },
			});
			if (
				!fresh ||
				fresh.presentationSlug !== presentationSlug ||
				fresh.expiresAt <= new Date() ||
				fresh.isRevoked ||
				(fresh.maxViews !== null && fresh.viewCount >= fresh.maxViews)
			) {
				return null;
			}

			const nextLink = await tx.presentationAccessLink.update({
				where: { id: fresh.id },
				data: {
					viewCount: { increment: 1 },
					usedAt: fresh.usedAt || new Date(),
				},
			});

			await tx.presentationAccessView.create({
				data: {
					tokenId: fresh.id,
					presentationSlug,
					ipAddress: req ? getIpAddress(req) : null,
					userAgent: req ? getUserAgent(req) : null,
				},
			});

			return nextLink;
		});

		if (!updated) {
			return { ok: false, error: 'Presentation link expired or invalid.' };
		}

		return { ok: true, link: publicPresentationLink(updated) };
	} catch {
		return { ok: false, error: 'Presentation link expired or invalid.' };
	}
}

export {
	SIGNATURA_ISSUERS_PRESENTATION_SLUG,
	SIGNATURA_ISSUERS_SLIDE_COUNT,
	adminPresentationLink,
	createPresentationAccessLink,
	createPresentationToken,
	decryptPresentationToken,
	encryptPresentationToken,
	hashPresentationToken,
	presentationShareUrl,
	publicPresentationLink,
	validatePresentationAccess,
};
