function extractTokenFromInput(rawValue) {
	const raw = String(rawValue || '').trim();
	if (!raw) return '';

	try {
		const url = new URL(raw);
		const fromQuery = url.searchParams.get('token');
		if (fromQuery) return fromQuery.trim();

		const fromPath =
			url.pathname.match(/\/verify\/([^/?#]+)/)?.[1] ||
			url.pathname.match(/\/api\/verify\/([^/?#]+)/)?.[1];
		if (fromPath) return decodeURIComponent(fromPath).trim();
	} catch {
		// Not a URL — treat as a plain token.
	}

	return raw;
}

export { extractTokenFromInput };
