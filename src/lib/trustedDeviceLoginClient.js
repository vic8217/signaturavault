export const TRUSTED_DEVICE_LOGIN_STORAGE_KEY = 'signatura.trustedDeviceLogin';

export function isStandalonePwa() {
	if (typeof window === 'undefined') return false;
	return (
		window.matchMedia('(display-mode: standalone)').matches ||
		window.navigator.standalone === true
	);
}

export function storeTrustedDeviceSignaturaId(signaturaId, origin) {
	if (typeof window === 'undefined') return;
	const normalized = String(signaturaId || '').trim().toUpperCase();
	if (!normalized) return;

	try {
		window.localStorage.setItem(
			TRUSTED_DEVICE_LOGIN_STORAGE_KEY,
			JSON.stringify({
				signaturaId: normalized,
				origin: origin || window.location.origin,
				updatedAt: Date.now(),
			}),
		);
	} catch {
		// Ignore storage failures in private mode or quota limits.
	}
}

export function readStoredTrustedDeviceSignaturaId(origin) {
	if (typeof window === 'undefined') return '';

	try {
		const raw = window.localStorage.getItem(TRUSTED_DEVICE_LOGIN_STORAGE_KEY);
		if (!raw) return '';

		const parsed = JSON.parse(raw);
		const resolvedOrigin = origin || window.location.origin;
		if (parsed.origin && parsed.origin !== resolvedOrigin) return '';

		return String(parsed.signaturaId || '').trim();
	} catch {
		return '';
	}
}

export function clearStoredTrustedDeviceSignaturaId() {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.removeItem(TRUSTED_DEVICE_LOGIN_STORAGE_KEY);
	} catch {
		// Ignore storage failures in private mode.
	}
}

export function shouldAutoPasskeyLoginOnOpen({
	externalReturnUrl = '',
	loginAccountType = 'user',
} = {}) {
	if (externalReturnUrl) return false;
	if (loginAccountType !== 'user') return false;
	return true;
}
