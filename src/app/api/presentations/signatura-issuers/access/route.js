import {
	SIGNATURA_ISSUERS_PRESENTATION_SLUG,
	validatePresentationAccess,
} from '@/lib/presentation-access';

export async function GET(req) {
	const { searchParams } = new URL(req.url);
	const result = await validatePresentationAccess({
		token: searchParams.get('token'),
		presentationSlug: SIGNATURA_ISSUERS_PRESENTATION_SLUG,
		req,
		incrementView: false,
	});

	if (!result.ok) {
		return Response.json({ ok: false, error: result.error }, { status: 403 });
	}

	return Response.json({ ok: true, link: result.link });
}
