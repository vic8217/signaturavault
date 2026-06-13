import { requireAdminRequest } from '@/lib/admin-access';
import { prisma } from '@/lib/prisma';
import {
	SIGNATURA_ISSUERS_PRESENTATION_SLUG,
	adminPresentationLink,
} from '@/lib/presentation-access';

export async function PATCH(req, { params }) {
	const admin = await requireAdminRequest(req);
	if (!admin.ok) return admin.response;

	const { id } = await params;
	const body = await req.json().catch(() => ({}));

	if (body.action !== 'revoke') {
		return Response.json({ error: 'Unsupported action' }, { status: 400 });
	}

	const existing = await prisma.presentationAccessLink.findFirst({
		where: {
			id,
			presentationSlug: SIGNATURA_ISSUERS_PRESENTATION_SLUG,
		},
	});

	if (!existing) {
		return Response.json({ error: 'Access link not found' }, { status: 404 });
	}

	const link = await prisma.presentationAccessLink.update({
		where: { id },
		data: { isRevoked: true },
	});

	return Response.json({ link: adminPresentationLink(link, req) });
}
