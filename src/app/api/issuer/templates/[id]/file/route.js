import { readTemplateFile } from '@/lib/template-files';
import { findTemplateForIssuer, requireIssuerContext } from '@/lib/issuer-templates';

export async function GET(_req, { params }) {
	const context = await requireIssuerContext();
	if (context.error) return context.error;

	const { id } = await params;
	const template = await findTemplateForIssuer(id, context);
	if (!template) return Response.json({ error: 'Template not found' }, { status: 404 });

	try {
		const file = await readTemplateFile(template);
		return new Response(file.bytes, {
			headers: {
				'Content-Type': file.mimeType,
				'Content-Disposition': `inline; filename="${file.filename}"`,
				'Cache-Control': 'private, max-age=60',
			},
		});
	} catch (error) {
		return Response.json(
			{ error: error instanceof Error ? error.message : 'Unable to read template file' },
			{ status: 404 },
		);
	}
}
