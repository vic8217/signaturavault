import { jsonError, safeApiErrorMessage } from '@/lib/api';

function accuraCallbackUrl(returnUrl: string) {
	const destination = new URL(returnUrl);
	const configuredOrigin = String(process.env.ACCURA_ORIGIN || '').trim();
	if (configuredOrigin) {
		const accuraOrigin = new URL(configuredOrigin);
		destination.protocol = accuraOrigin.protocol;
		destination.host = accuraOrigin.host;
	}
	return destination;
}

export async function POST(req: Request) {
	try {
		const body = await req.json().catch(() => ({}));
		const returnUrl = String(body.returnUrl || '').trim();
		const signaturaId = String(body.signaturaId || '').trim().toUpperCase();
		if (!returnUrl || !signaturaId) {
			return jsonError('ACCURA return URL and Signatura ID are required', 400);
		}

		const destination = accuraCallbackUrl(returnUrl);
		destination.searchParams.set('signaturaId', signaturaId);
		destination.searchParams.set('source', 'accura');
		destination.searchParams.set('companyCode', String(body.companyCode || ''));
		destination.searchParams.set('role', String(body.role || ''));
		destination.searchParams.set('rolePrefix', String(body.rolePrefix || ''));
		destination.searchParams.set('registrationStatus', 'success');

		const response = await fetch(destination, {
			method: 'GET',
			cache: 'no-store',
			redirect: 'manual',
		});
		if (!response.ok) {
			const message = await response.text().catch(() => '');
			return jsonError(message || 'ACCURA could not accept the existing Signatura ID', response.status);
		}

		return Response.json({ ok: true });
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to continue existing ACCURA registration'),
			400,
		);
	}
}
