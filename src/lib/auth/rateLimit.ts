const buckets = new Map<string, { count: number; resetAt: number }>();

function getIpAddress(req: Request) {
	return (
		req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
		req.headers.get('x-real-ip') ||
		'unknown'
	);
}

export function rateLimitKey(
	req: Request,
	action: string,
	subject = '',
) {
	const ip = getIpAddress(req);
	return `${action}:${ip}:${subject}`.toLowerCase();
}

export function enforceRateLimit(
	key: string,
	{ max = 10, windowMs = 60_000 } = {},
) {
	const now = Date.now();
	const bucket = buckets.get(key);

	if (!bucket || now >= bucket.resetAt) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return null;
	}

	bucket.count += 1;
	if (bucket.count > max) {
		return { retryAfterMs: Math.max(0, bucket.resetAt - now) };
	}

	return null;
}

export function rateLimitResponse(retryAfterMs: number) {
	return Response.json(
		{
			error: 'Too many attempts. Please wait and try again.',
			retryAfterMs,
		},
		{
			status: 429,
			headers: {
				'Retry-After': String(Math.ceil(retryAfterMs / 1000)),
			},
		},
	);
}

export function resetRateLimitsForTests() {
	buckets.clear();
}
