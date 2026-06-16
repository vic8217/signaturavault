const REGISTRATION_API_HEADERS = {
	'Content-Type': 'application/json',
	Accept: 'application/json',
	'ngrok-skip-browser-warning': '1',
};

export async function registrationApiFetch(url, options = {}) {
	return fetch(url, {
		...options,
		headers: {
			...REGISTRATION_API_HEADERS,
			...(options.headers || {}),
		},
	});
}

export async function readRegistrationApiJson(response, label) {
	const contentType = String(response.headers.get('content-type') || '').toLowerCase();
	const raw = await response.text();

	if (!raw.trim()) {
		throw new Error(
			`${label} returned an empty response (${response.status}). Refresh the page and try again.`,
		);
	}

	if (!contentType.includes('application/json')) {
		const preview = raw.slice(0, 80).replace(/\s+/g, ' ').trim();
		throw new Error(
			`${label} returned a non-JSON response (${response.status}). Use the same HTTPS app URL on your phone and retry. ${preview.startsWith('<!DOCTYPE') || preview.startsWith('<html') ? 'The server returned an HTML page instead of JSON (common with ngrok or an expired dev session).' : ''}`.trim(),
		);
	}

	try {
		return JSON.parse(raw);
	} catch {
		throw new Error(
			`${label} returned invalid JSON (${response.status}). Refresh the page and retry passkey setup from the same HTTPS URL.`,
		);
	}
}

export async function registrationApiRequest(url, options = {}, label = 'Registration request') {
	const response = await registrationApiFetch(url, options);
	const data = await readRegistrationApiJson(response, label);
	return { response, data };
}
