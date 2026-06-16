import { normalizeExternalReturnUrl } from '@/lib/externalReturnUrl';

function buildExternalLoginReturnUrl(
	externalReturnUrl,
	{ signaturaId, challengeId, signaturaUserId = '', state = '' } = {},
) {
	const normalizedReturnUrl = normalizeExternalReturnUrl(externalReturnUrl);
	if (!normalizedReturnUrl || !signaturaId || !challengeId) return '';

	try {
		const destination = new URL(normalizedReturnUrl);
		destination.searchParams.set('signaturaId', signaturaId);
		destination.searchParams.set('signaturaAssertion', challengeId);
		if (signaturaUserId) {
			destination.searchParams.set('signaturaUserId', signaturaUserId);
		}
		if (state) {
			destination.searchParams.set('state', state);
		}
		return destination.toString();
	} catch {
		return '';
	}
}

export { buildExternalLoginReturnUrl };
