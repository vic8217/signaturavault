import { requireAdminRole } from '@/lib/admin-auth';

export async function GET() {
	const auth = await requireAdminRole();
	if (auth.error) return auth.error;

	return Response.json(
		{
			error:
				'Provider admins cannot access uploaded template files until Zero Trust Level 2 file-access controls are implemented.',
		},
		{ status: 403 },
	);
}
