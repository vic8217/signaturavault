import { requireAdminRequest } from '@/lib/admin-access';
import { prisma } from '@/lib/prisma';
import {
	SIGNATURA_ISSUERS_PRESENTATION_SLUG,
	adminPresentationLink,
	createPresentationAccessLink,
	publicPresentationLink,
} from '@/lib/presentation-access';

function parseExpiration(value) {
	const date = new Date(value);
	if (!value || Number.isNaN(date.getTime())) return null;
	return date;
}

function parseMaxViews(value) {
	if (value === null || value === undefined || value === '') return null;
	const numeric = Number(value);
	if (!Number.isInteger(numeric) || numeric < 1) return null;
	return numeric;
}

export async function GET(req) {
	const admin = await requireAdminRequest(req);
	if (!admin.ok) return admin.response;

	const links = await prisma.presentationAccessLink.findMany({
		where: { presentationSlug: SIGNATURA_ISSUERS_PRESENTATION_SLUG },
		orderBy: { createdAt: 'desc' },
		take: 50,
	});

	return Response.json({
		links: links.map((link) => adminPresentationLink(link, req)),
	});
}

export async function POST(req) {
	const admin = await requireAdminRequest(req);
	if (!admin.ok) return admin.response;

	const body = await req.json().catch(() => ({}));
	const expiresAt = parseExpiration(body.expiresAt);
	if (!expiresAt || expiresAt <= new Date()) {
		return Response.json(
			{ error: 'Expiration must be a future date and time' },
			{ status: 400 },
		);
	}

	const maxViews = parseMaxViews(body.maxViews);
	const { token, link } = await createPresentationAccessLink({
		presentationSlug: SIGNATURA_ISSUERS_PRESENTATION_SLUG,
		viewerName: body.viewerName,
		viewerEmail: body.viewerEmail,
		expiresAt,
		maxViews,
	});

	return Response.json(
		{
			link: publicPresentationLink(link),
			token,
			url: adminPresentationLink(link, req).shareUrl,
		},
		{ status: 201 },
	);
}
