import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { createIssuerAuthorizationCode } from '@/lib/issuer-authorization';

export async function POST(req: Request) {
	try {
		const body = await req.json().catch(() => ({}));
		const label = String(body.label || 'Issuer Signatura ID').trim() || 'Issuer Signatura ID';
		const issuerId = String(body.issuerId || '').trim();
		const tenantId = String(body.tenantId || '').trim();

		const result = await createIssuerAuthorizationCode({
			label,
			issuerId,
			tenantId,
		});

		return Response.json({
			ok: true,
			message: 'Issuer authorization code generated.',
			...result,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to generate issuer authorization code'),
			500,
		);
	}
}
