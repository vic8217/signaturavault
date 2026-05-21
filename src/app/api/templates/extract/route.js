import { POST as extractTemplate } from '@/app/api/issuer/templates/[id]/extract/route';

export async function POST(req) {
	const body = await req.clone().json().catch(() => ({}));
	const id = String(body.templateId || body.id || '').trim();
	if (!id) {
		return Response.json({ error: 'templateId is required' }, { status: 400 });
	}

	return extractTemplate(req, { params: Promise.resolve({ id }) });
}
