import crypto from 'crypto';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { prisma } from '@/lib/prisma';

function serviceSecret() {
	return (
		process.env.HAVEN_SIGNATURA_SERVICE_SECRET?.trim() ||
		process.env.HAVENXSIG_CLIENT_SECRET?.trim() ||
		''
	);
}

function assertHavenServiceRequest(req) {
	const expected = serviceSecret();

	if (!expected) {
		throw new Error('Haven service integration is not configured.');
	}

	const provided = req.headers.get('x-haven-signatura-service')?.trim() || '';

	const left = Buffer.from(provided);
	const right = Buffer.from(expected);

	if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
		throw new Error('Haven service authorization failed.');
	}
}

export async function POST(req) {
	try {
		assertHavenServiceRequest(req);

		const body = await req.json().catch(function () {
			return {};
		});

		const tenantId = String(body.tenantId || '').trim();
		const name = String(body.name || '').trim();

		if (!tenantId || !name) {
			return jsonError('tenantId and name are required', 400);
		}

		const tenant = await prisma.tenant.upsert({
			where: { id: tenantId },
			update: {
				name: name,
				externalReference: tenantId,
			},
			create: {
				id: tenantId,
				name: name,
				externalReference: tenantId,
			},
		});

		return Response.json({
			ok: true,
			tenant: {
				id: tenant.id,
				name: tenant.name,
				externalReference: tenant.externalReference,
			},
		});
	} catch (error) {
		const status =
			error instanceof Error && /authorization|configured/i.test(error.message)
				? 401
				: 400;

		return jsonError(
			safeApiErrorMessage(error, 'Unable to provision Signatura HOA tenant'),
			status,
		);
	}
}
