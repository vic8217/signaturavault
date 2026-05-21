import { prisma } from '@/lib/prisma';
import { requireAdminRole } from '@/lib/admin-auth';
import { readTemplateFile } from '@/lib/template-files';

export async function GET(_req, { params }) {
	const auth = await requireAdminRole();
	if (auth.error) return auth.error;

	const { id } = await params;
	const template = await prisma.documentTemplate.findUnique({ where: { id } });
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
