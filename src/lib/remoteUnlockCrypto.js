const ALG = 'ECDH-P256-AES-GCM-V1';

function bufferToBase64url(buffer) {
	const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlToBuffer(value) {
	const padded = String(value).replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

async function importBrowserPublicKey(publicKeySpki) {
	return crypto.subtle.importKey(
		'spki',
		base64urlToBuffer(publicKeySpki),
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[],
	);
}

async function deriveAesKey(privateKey, publicKey) {
	return crypto.subtle.deriveKey(
		{ name: 'ECDH', public: publicKey },
		privateKey,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt'],
	);
}

export async function wrapHoaKeyForBrowser(hoaKey, browserPublicKeySpki) {
	const browserPublicKey = await importBrowserPublicKey(browserPublicKeySpki);
	const phonePair = await crypto.subtle.generateKey(
		{ name: 'ECDH', namedCurve: 'P-256' },
		true,
		['deriveKey'],
	);
	const aesKey = await deriveAesKey(phonePair.privateKey, browserPublicKey);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		aesKey,
		new TextEncoder().encode(String(hoaKey)),
	);
	const phonePublicSpki = await crypto.subtle.exportKey('spki', phonePair.publicKey);
	const encryptedBytes = new Uint8Array(ciphertext);
	const tagLength = 16;
	const body = encryptedBytes.slice(0, encryptedBytes.length - tagLength);
	const tag = encryptedBytes.slice(encryptedBytes.length - tagLength);

	return JSON.stringify({
		v: 1,
		alg: ALG,
		phonePublicKey: bufferToBase64url(phonePublicSpki),
		iv: bufferToBase64url(iv),
		tag: bufferToBase64url(tag),
		ciphertext: bufferToBase64url(body),
	});
}
