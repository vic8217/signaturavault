import crypto from 'crypto';

const DEVICE_BINDING_PREFIX = 'trusted-device-binding-v1';

function normalizeDeviceBindingSecret(value) {
	const normalized = String(value || '').trim();
	if (!/^[A-Za-z0-9_-]{32,256}$/.test(normalized)) return '';
	return normalized;
}

function trustedDeviceBindingHash({ userId, credentialId, deviceBindingSecret }) {
	const secret = normalizeDeviceBindingSecret(deviceBindingSecret);
	if (!userId || !credentialId || !secret) return '';
	return crypto
		.createHash('sha256')
		.update(`${DEVICE_BINDING_PREFIX}:${userId}:${credentialId}:${secret}`)
		.digest('hex');
}

function timingSafeStringEqual(leftValue, rightValue) {
	const left = Buffer.from(String(leftValue || ''));
	const right = Buffer.from(String(rightValue || ''));
	return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyTrustedDeviceBinding(
	trustedDevice,
	{ userId, deviceBindingSecret },
) {
	if (!trustedDevice?.credentialId || !trustedDevice?.deviceHash) return false;
	const expected = trustedDeviceBindingHash({
		userId,
		credentialId: trustedDevice.credentialId,
		deviceBindingSecret,
	});
	if (!expected) return false;
	return timingSafeStringEqual(expected, trustedDevice.deviceHash);
}

export {
	normalizeDeviceBindingSecret,
	trustedDeviceBindingHash,
	verifyTrustedDeviceBinding,
};
