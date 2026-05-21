import {
	requireIssuerProfileContext,
	updateActiveIssuerProfile,
} from '@/lib/issuer-profile';

export async function GET() {
	const context = await requireIssuerProfileContext();
	if (context.error) return context.error;

	return Response.json({ profile: context.profile });
}

export async function PUT(req) {
	const body = await req.json();
	const result = await updateActiveIssuerProfile(body);
	if (result.error) return result.error;

	return Response.json({ profile: result.profile });
}
