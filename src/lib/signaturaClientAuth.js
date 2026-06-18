import crypto from 'crypto';

const DEFAULT_ACCURA_CLIENT_ID = 'accura';

function timingSafeEqualString(left, right) {
	const leftBuffer = Buffer.from(String(left || ''));
	const rightBuffer = Buffer.from(String(right || ''));
	return (
		leftBuffer.length === rightBuffer.length &&
		crypto.timingSafeEqual(leftBuffer, rightBuffer)
	);
}

function basicCredentials(req) {
	const auth = req.headers.get('authorization') || '';
	const match = auth.match(/^Basic\s+(.+)$/i);
	if (!match) return {};
	try {
		const decoded = Buffer.from(match[1], 'base64').toString('utf8');
		const separator = decoded.indexOf(':');
		if (separator === -1) return {};
		return {
			clientId: decoded.slice(0, separator),
			clientSecret: decoded.slice(separator + 1),
		};
	} catch {
		return {};
	}
}

function clientCredentials(req, body = {}) {
	const basic = basicCredentials(req);
	return {
		clientId:
			String(
				basic.clientId ||
					req.headers.get('x-signatura-client-id') ||
					body.clientId ||
					'',
			).trim() || null,
		clientSecret:
			String(
				basic.clientSecret ||
					req.headers.get('x-signatura-client-secret') ||
					body.clientSecret ||
					'',
			).trim() || null,
	};
}

function resolvedAccuraClientSecret() {
	return (
		process.env.SIGNATURA_CLIENT_SECRET?.trim() ||
		process.env.ACCURA_CLIENT_SECRET?.trim() ||
		null
	);
}

async function authenticateSignaturaClient({ prisma, clientId, clientSecret }) {
	if (!clientId || !clientSecret) return null;

	const envClientId =
		process.env.SIGNATURA_CLIENT_ID?.trim() ||
		process.env.ACCURA_CLIENT_ID?.trim() ||
		DEFAULT_ACCURA_CLIENT_ID;
	const envClientSecret = resolvedAccuraClientSecret();
	if (
		envClientSecret &&
		timingSafeEqualString(clientId, envClientId) &&
		timingSafeEqualString(clientSecret, envClientSecret)
	) {
		return { clientId: envClientId, sourceApp: 'ACCURA' };
	}

	const client = await prisma.apiClient.findFirst({
		where: {
			clientId,
			status: 'active',
		},
	});
	if (
		client?.clientSecret &&
		timingSafeEqualString(clientSecret, client.clientSecret)
	) {
		return {
			clientId: client.clientId,
			sourceApp:
				client.clientId.toLowerCase() === DEFAULT_ACCURA_CLIENT_ID
					? 'ACCURA'
					: client.name?.toUpperCase() || null,
		};
	}

	return null;
}

export {
	DEFAULT_ACCURA_CLIENT_ID,
	authenticateSignaturaClient,
	clientCredentials,
	timingSafeEqualString,
};
