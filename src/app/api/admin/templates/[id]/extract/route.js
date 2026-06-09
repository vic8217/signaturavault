import { requireAdminRole } from '@/lib/admin-auth';

export async function POST() {
	const auth = await requireAdminRole();
	if (auth.error) return auth.error;

	return Response.json(
		{
			error:
				'Provider admins cannot run OCR over uploaded customer files until Zero Trust Level 2 file-access controls are implemented.',
		},
		{ status: 403 },
	);
}
