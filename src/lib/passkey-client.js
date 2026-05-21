import {
	browserSupportsWebAuthn,
	startAuthentication,
	startRegistration,
} from '@simplewebauthn/browser';

async function reverifyPasskey() {
	if (!browserSupportsWebAuthn()) {
		throw new Error('This browser does not support passkeys/WebAuthn.');
	}

	const startResponse = await fetch('/api/security/reauth/start', {
		method: 'POST',
	});
	const startData = await startResponse.json();
	if (!startResponse.ok) throw new Error(startData.error);

	const assertion = await startAuthentication({
		optionsJSON: startData.options,
	});

	const finishResponse = await fetch('/api/security/reauth/finish', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ response: assertion }),
	});
	const finishData = await finishResponse.json();
	if (!finishResponse.ok) throw new Error(finishData.error);

	return finishData;
}

async function registerAdditionalPasskey(deviceName) {
	if (!browserSupportsWebAuthn()) {
		throw new Error('This browser does not support passkeys/WebAuthn.');
	}

	const startResponse = await fetch('/api/security/passkeys/start', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ deviceName }),
	});
	const startData = await startResponse.json();
	if (!startResponse.ok) throw new Error(startData.error);

	const registration = await startRegistration({
		optionsJSON: startData.options,
	});

	const finishResponse = await fetch('/api/security/passkeys/finish', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ deviceName, response: registration }),
	});
	const finishData = await finishResponse.json();
	if (!finishResponse.ok) throw new Error(finishData.error);

	return finishData;
}

export { registerAdditionalPasskey, reverifyPasskey };
