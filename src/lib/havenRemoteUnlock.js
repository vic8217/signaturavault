function havenBaseUrl() {
	return (
		process.env.HAVENXSIG_ORIGIN ||
		process.env.NEXT_PUBLIC_HAVENXSIG_URL ||
		'http://localhost:3001'
	).replace(/\/+$/, '');
}

function serviceSecret() {
	return (
		process.env.HAVEN_SIGNATURA_SERVICE_SECRET?.trim() ||
		process.env.HAVENXSIG_CLIENT_SECRET?.trim() ||
		''
	);
}

function serviceHeaders() {
	const secret = serviceSecret();
	if (!secret) throw new Error('Haven service integration is not configured.');
	return {
		accept: 'application/json',
		'content-type': 'application/json',
		'x-haven-signatura-service': secret,
	};
}

export async function fetchHavenUnlockChallenge({ challengeId, shortCode }) {
	const url = new URL('/api/zero-trust/unlock-challenges/lookup', havenBaseUrl());
	url.searchParams.set('cid', challengeId);
	url.searchParams.set('code', shortCode);
	const response = await fetch(url, {
		method: 'GET',
		headers: serviceHeaders(),
		cache: 'no-store',
	});
	const body = await response.json().catch(() => ({}));
	if (!response.ok || body?.ok === false) {
		throw new Error(body?.error || 'Unlock challenge not found or expired.');
	}
	return body.challenge;
}

export async function approveHavenUnlockChallenge({
	challengeId,
	shortCode,
	signaturaSubject,
	signaturaUserId,
	deviceId,
	proofId,
	keyRef,
	wrappedKeyPayload,
}) {
	const response = await fetch(
		`${havenBaseUrl()}/api/zero-trust/unlock-challenges/${challengeId}/approve`,
		{
			method: 'POST',
			headers: serviceHeaders(),
			body: JSON.stringify({
				shortCode,
				signaturaSubject,
				signaturaUserId,
				deviceId,
				proofId,
				keyRef,
				wrappedKeyPayload,
			}),
			cache: 'no-store',
		},
	);
	const body = await response.json().catch(() => ({}));
	if (!response.ok || body?.ok === false) {
		throw new Error(body?.error || 'Unable to approve Haven unlock challenge.');
	}
	return body.challenge;
}
