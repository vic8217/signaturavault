import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import {
	SIGNATURA_ACCOUNT_TYPES,
	createUniqueSignaturaId,
	getSignaturaAccountType,
	normalizeSignaturaAccountType,
	userPublicIdentity,
} from '@/lib/identity';
import {
	accountLookupHashes,
	encryptedAccountContactFields,
	ensureAccountPrivateFieldKeyReference,
	normalizeEmail,
	normalizeFullName,
	normalizeHandphone,
} from '@/lib/account-private-fields';
import {
	assertSecureWebAuthnRequest,
	challengeExpiresAt,
	getUserAgent,
	logSecurityEvent,
} from '@/lib/webauthn';

function validateEmail(email: string) {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const body = await req.json().catch(() => ({}));
		const fullName = normalizeFullName(body.fullName);
		const handphone = normalizeHandphone(body.handphone);
		const email = normalizeEmail(body.email);
		const accountType = normalizeSignaturaAccountType(body.accountType);

		if (!fullName || fullName.length < 2) return jsonError('Full name is required');
		if (!handphone || handphone.replace(/\D/g, '').length < 7) {
			return jsonError('Handphone number is required');
		}
		if (!email || !validateEmail(email)) return jsonError('Valid email address is required');
		if (
			accountType === SIGNATURA_ACCOUNT_TYPES.ADMIN &&
			process.env.NODE_ENV === 'production'
		) {
			return jsonError('Admin Signatura IDs must be provisioned internally', 403);
		}

		const { emailLookupHash, mobileLookupHash } = accountLookupHashes({
			email,
			handphone,
		});
		const matchingContactUsers = await prisma.user.findMany({
			where: {
				OR: [{ emailLookupHash }, { mobileLookupHash }],
			},
			select: { id: true, signaturaId: true },
		});
		const existing = matchingContactUsers.find(
			(user) => getSignaturaAccountType(user.signaturaId) === accountType,
		);
		if (existing) return jsonError('Account already exists', 409);

		const userId = crypto.randomUUID();
		const signaturaId = await createUniqueSignaturaId(prisma, accountType);
		const registrationToken = crypto.randomBytes(32).toString('base64url');
		const encryptedFields = encryptedAccountContactFields({
			userId,
			fullName,
			handphone,
			email,
		});

		const user = await prisma.$transaction(async (tx) => {
			const created = await tx.user.create({
				data: {
					id: userId,
					signaturaId,
					email: null,
					name: null,
					emailLookupHash,
					mobileLookupHash,
					accountStatus: 'pending_device',
					trustLevel: 1,
				},
			});
			await ensureAccountPrivateFieldKeyReference(tx, userId);
			await tx.encryptedPrivateField.createMany({ data: encryptedFields });
			await tx.authChallenge.create({
				data: {
					id: crypto.randomUUID(),
					userId,
					type: 'REGISTER_ACCOUNT',
					challenge: registrationToken,
					userAgent: getUserAgent(req),
					expiresAt: challengeExpiresAt(),
				},
			});
			return created;
		});

		await logSecurityEvent(req, 'account_created_private_fields_encrypted', user.id, {
			signaturaId: user.signaturaId,
			accountType,
			fields: ['full_name', 'handphone', 'email'],
			plaintextStored: false,
		});

		return Response.json({
			ok: true,
			user: userPublicIdentity(user),
			registrationToken,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to create account'),
			400,
		);
	}
}
