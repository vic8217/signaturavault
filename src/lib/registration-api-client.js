const SIGNATURA_API_HEADERS = {
	'Content-Type': 'application/json',
	Accept: 'application/json',
	'ngrok-skip-browser-warning': '1',
};

function resolveApiUrl(url) {
	if (typeof window !== 'undefined' && url.startsWith('/')) {
		return new URL(url, window.location.origin).toString();
	}
	return url;
}

function tryParseJson(raw) {
	const trimmed = String(raw || '').trim();
	if (!trimmed) return null;
	if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
	try {
		return JSON.parse(trimmed);
	} catch {
		return null;
	}
}

export async function signaturaApiFetch(url, options = {}) {
	return fetch(resolveApiUrl(url), {
		...options,
		headers: {
			...SIGNATURA_API_HEADERS,
			...(options.headers || {}),
		},
	});
}

export async function readSignaturaApiJson(response, label) {
	const contentType = String(response.headers.get('content-type') || '').toLowerCase();
	const raw = await response.text();

	if (!raw.trim()) {
		throw new Error(
			`${label} returned an empty response (${response.status}). Refresh the page and try again.`,
		);
	}

	const parsed = tryParseJson(raw);
	if (parsed !== null) {
		return parsed;
	}

	if (contentType.includes('application/json')) {
		throw new Error(
			`${label} returned invalid JSON (${response.status}). Refresh the page and retry from the same HTTPS URL.`,
		);
	}

	const preview = raw.slice(0, 120).replace(/\s+/g, ' ').trim();
	const htmlHint =
		preview.startsWith('<!DOCTYPE') || preview.startsWith('<html')
			? 'The server returned an HTML page instead of JSON (common with ngrok or an expired dev session).'
			: preview
				? `Server said: ${preview}`
				: '';
	throw new Error(
		`${label} returned a non-JSON response (${response.status}). Use the same HTTPS app URL on your phone and retry. ${htmlHint}`.trim(),
	);
}

export async function signaturaApiRequest(url, options = {}, label = 'Signatura request') {
	const response = await signaturaApiFetch(url, options);
	const data = await readSignaturaApiJson(response, label);
	return { response, data };
}

/** @deprecated Use signaturaApiFetch */
export const registrationApiFetch = signaturaApiFetch;
/** @deprecated Use readSignaturaApiJson */
export const readRegistrationApiJson = readSignaturaApiJson;
/** @deprecated Use signaturaApiRequest */
export const registrationApiRequest = signaturaApiRequest;
