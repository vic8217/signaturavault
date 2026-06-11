import { loadIssuerDashboard } from '@/lib/issuer-dashboard';
import { requireIssuerProfileContext } from '@/lib/issuer-profile';

export async function GET() {
	const context = await requireIssuerProfileContext();
	if (context.error) return context.error;

	const dashboard = await loadIssuerDashboard(context.profile);
	return Response.json(dashboard);
}
