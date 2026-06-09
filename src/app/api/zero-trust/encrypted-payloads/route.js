import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { auditEvent } from '@/lib/audit';
import { prisma } from '@/lib/prisma';
import { resolveZeroTrustActor } from '@/lib/security/zeroTrustActor';
import {
	encryptedPrivateFieldToApi,
	normalizeEncryptedPrivateField,
	validateEncryptedFieldAccess,
	validateEncryptedFieldMutation,
} from '@/lib/security/encryptedFields';
import {
	validateUnlockAuthorization,
	verifyTenantScope,
} from '@/lib/security/privateFieldKeys';
import { corsHeadersForRequest, corsPreflight } from '@/lib/signatura-oauth';

async function responseHeaders(req) {
	return { 'Cache-Control': 'no-store', ...(await corsHeadersForRequest(req)) };
}

export async function OPTIONS(req) {
	return corsPreflight(req);
}

export async function GET(req) {
	try {
		const actor = await resolveZeroTrustActor(req);
		if (!actor) return jsonError('Authentication required', 401);

		const session = actor.session;
		const role = actor.role;
		const { searchParams } = new URL(req.url);
		const tenantId = String(searchParams.get('tenantId') || '').trim();
		const recordType = String(searchParams.get('recordType') || '').trim();
		const recordId = String(searchParams.get('recordId') || '').trim();
		const keyRef = String(searchParams.get('keyRef') || '').trim();
		const authorizationToken = String(
			searchParams.get('authorizationToken') || '',
		).trim();
		const purpose = String(
			searchParams.get('purpose') || 'read_encrypted_payload',
		).trim();
		if (!tenantId || !recordType || !recordId || !keyRef || !authorizationToken) {
			return jsonError(
				'tenantId, recordType, recordId, keyRef, and authorizationToken are required',
			);
		}

		const scope = await verifyTenantScope({
			prisma,
			session,
			role,
			tenantId,
			actorSource: actor.source,
		});
		await validateUnlockAuthorization({
			prisma,
			audit: auditEvent,
			session,
			role,
			actorSource: actor.source,
			tenantId,
			keyRef,
			purpose,
			authorizationToken,
		});
		const fields = await prisma.encryptedPrivateField.findMany({
			where: {
				tenantId,
				recordType,
				recordId,
				keyRef,
				...(scope.ownerUserId ? { ownerUserId: scope.ownerUserId } : {}),
			},
			orderBy: { fieldKey: 'asc' },
		});
		for (const field of fields) {
			validateEncryptedFieldAccess({
				role,
				session,
				field,
				membership: scope.membership,
			});
		}

		await auditEvent({
			tenantId,
			userId: session.userId,
			action: 'private_record_ciphertext_viewed',
			target: `${recordType}:${recordId}`,
			details: { fieldCount: fields.length },
		});

		return Response.json(
			{
				fields: fields.map(encryptedPrivateFieldToApi),
				rawKeyReturned: false,
				plaintextReturned: false,
			},
			{ headers: await responseHeaders(req) },
		);
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to load encrypted private fields'),
			400,
		);
	}
}

export async function POST(req) {
	try {
		const actor = await resolveZeroTrustActor(req);
		if (!actor) return jsonError('Authentication required', 401);

		const session = actor.session;
		const role = actor.role;
		const body = await req.json().catch(() => ({}));
		const field = normalizeEncryptedPrivateField(body);
		const scope = await verifyTenantScope({
			prisma,
			session,
			role,
			tenantId: field.tenantId,
			actorSource: actor.source,
		});
		validateEncryptedFieldAccess({
			role,
			session,
			field,
			membership: scope.membership,
		});
		await validateUnlockAuthorization({
			prisma,
			audit: auditEvent,
			session,
			role,
			actorSource: actor.source,
			tenantId: field.tenantId,
			hoaId: field.hoaId,
			keyRef: field.keyRef,
			purpose: body.purpose || 'encrypt_payload',
			authorizationToken: body.authorizationToken,
		});

		const privateFieldKey = await prisma.privateFieldKeyReference.findFirst({
			where: {
				tenantId: field.tenantId,
				keyRef: field.keyRef,
				status: 'active',
			},
			select: { keyRef: true },
		});
		if (!privateFieldKey) return jsonError('Active private-field key reference not found', 404);

		const existingField = await prisma.encryptedPrivateField.findUnique({
			where: {
				tenantId_recordType_recordId_fieldKey: {
					tenantId: field.tenantId,
					recordType: field.recordType,
					recordId: field.recordId,
					fieldKey: field.fieldKey,
				},
			},
		});
		validateEncryptedFieldMutation({
			existingField,
			incomingField: field,
			role,
			session,
		});

		const saved = await prisma.encryptedPrivateField.upsert({
			where: {
				tenantId_recordType_recordId_fieldKey: {
					tenantId: field.tenantId,
					recordType: field.recordType,
					recordId: field.recordId,
					fieldKey: field.fieldKey,
				},
			},
			create: field,
			update: {
				hoaId: field.hoaId,
				ownerUserId: field.ownerUserId,
				keyRef: field.keyRef,
				algorithm: field.algorithm,
				iv: field.iv,
				tag: field.tag,
				ciphertext: field.ciphertext,
				aad: field.aad,
				version: field.version,
			},
		});

		await auditEvent({
			tenantId: field.tenantId,
			userId: session.userId,
			action: 'private_record_encrypted_field_saved',
			target: `${field.recordType}:${field.recordId}:${field.fieldKey}`,
			details: {
				keyRef: field.keyRef,
				algorithm: field.algorithm,
				version: field.version,
			},
		});

		return Response.json(
			{
				field: encryptedPrivateFieldToApi(saved),
				plaintextStored: false,
			},
			{ headers: await responseHeaders(req) },
		);
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to save encrypted private field'),
			400,
		);
	}
}
