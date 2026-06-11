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
	const provided = req.headers.get('x-haven-signatura-service')?.trim() ?? '';
	const left = Buffer.from(provided);
	const right = Buffer.from(expected);
	if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
		throw new Error('Haven service authorization failed.');
	}
}

export async function POST(req, { params }) {
	try {
		assertHavenServiceRequest(req);
		const { tenantId } = await params;
		const normalizedTenantId = String(tenantId ?? '').trim();
		if (!normalizedTenantId) {
			return jsonError('tenantId is required', 400);
		}

		await prisma.privateFieldKeyAuthorization.deleteMany({
			where: { tenantId: normalizedTenantId },
		});
		await prisma.encryptedPrivateField.deleteMany({
			where: { tenantId: normalizedTenantId },
		});
		await prisma.privateFieldKeyReference.deleteMany({
			where: { tenantId: normalizedTenantId },
		});
		await prisma.issuerUser.deleteMany({
			where: { tenantId: normalizedTenantId },
		});

		return Response.json({
			ok: true,
			tenantId: normalizedTenantId,
			cleared: ['authorizations', 'private_fields', 'key_references', 'issuer_users'],
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to reset Signatura HOA crypto state'),
			error instanceof Error && /authorization|configured/i.test(error.message) ? 401 : 400,
		);
	}
}
