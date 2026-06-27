const DEVICE_BINDING_STORAGE_PREFIX = 'signatura.trustedDeviceBinding.';

function normalizeSignaturaId(value) {
	return String(value || '').trim().toUpperCase();
}

function deviceBindingStorageKey(signaturaId) {
	return `${DEVICE_BINDING_STORAGE_PREFIX}${normalizeSignaturaId(signaturaId)}`;
}

function base64url(bytes) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createDeviceBindingSecret() {
	const bytes = new Uint8Array(32);
	window.crypto.getRandomValues(bytes);
	return base64url(bytes);
}

function readDeviceBindingSecret(signaturaId) {
	if (typeof window === 'undefined') return '';
	try {
		return window.localStorage.getItem(deviceBindingStorageKey(signaturaId)) || '';
	} catch {
		return '';
	}
}

function storeDeviceBindingSecret(signaturaId, secret) {
	if (typeof window === 'undefined') return;
	const normalizedSignaturaId = normalizeSignaturaId(signaturaId);
	const normalizedSecret = String(secret || '').trim();
	if (!normalizedSignaturaId || !normalizedSecret) return;
	try {
		window.localStorage.setItem(
			deviceBindingStorageKey(normalizedSignaturaId),
			normalizedSecret,
		);
	} catch {
		// Local storage can be unavailable in strict browser modes. The passkey
		// still works locally, but QR approval requires registering the device again.
	}
}

export {
	createDeviceBindingSecret,
	readDeviceBindingSecret,
	storeDeviceBindingSecret,
};
