import crypto from 'crypto';
import { SIGNATURA_ACCOUNT_TYPES, createUniqueSignaturaId } from '@/lib/identity';
import {
	accountLookupHashes,
	encryptedAccountContactFields,
	ensureAccountPrivateFieldKeyReference,
} from '@/lib/account-private-fields';

const IDENTITY_BOOTSTRAP_ORDER = [
	'INVITATION',
	'IDENTITY',
	'PASSKEY',
	'TRUSTED_DEVICE',
	'MEMBERSHIP',
	'ROLES',
	'ACTIVE',
];

function normalizeLookupHash(value) {
	return String(value || '').trim();
}

async function findExistingSignaturaIdentity(
	client,
	{ emailLookupHash = '', mobileLookupHash = '' } = {},
) {
	const hashes = [emailLookupHash, mobileLookupHash].map(normalizeLookupHash).filter(Boolean);
	if (hashes.length === 0) return null;
	return client.user.findFirst({
		where: {
			OR: [
				emailLookupHash ? { emailLookupHash } : undefined,
				mobileLookupHash ? { mobileLookupHash } : undefined,
			].filter(Boolean),
		},
		orderBy: { createdAt: 'asc' },
	});
}

async function createSignaturaIdentity(
	client,
	{
		userId = crypto.randomUUID(),
		fullName = '',
		handphone = '',
		email = '',
		emailLookupHash = '',
		mobileLookupHash = '',
		accountStatus = 'pending_passkey_creation',
		trustLevel = 1,
		withEncryptedPrivateFields = true,
	} = {},
) {
	const lookupHashes =
		emailLookupHash || mobileLookupHash
			? { emailLookupHash, mobileLookupHash }
			: accountLookupHashes({ email, handphone });
	const signaturaId = await createUniqueSignaturaId(
		client,
		SIGNATURA_ACCOUNT_TYPES.DOCUMENT_OWNER,
	);
	const identity = await client.user.create({
		data: {
			id: userId,
			signaturaId,
			email: null,
			name: null,
			emailLookupHash: lookupHashes.emailLookupHash || null,
			mobileLookupHash: lookupHashes.mobileLookupHash || null,
			accountStatus,
			trustLevel,
		},
	});

	if (withEncryptedPrivateFields && fullName && handphone && email) {
		await ensureAccountPrivateFieldKeyReference(client, userId);
		await client.encryptedPrivateField.createMany({
			data: encryptedAccountContactFields({
				userId,
				fullName,
				handphone,
				email,
			}),
		});
	}

	return identity;
}

async function resolveIdentityForRegistration(
	client,
	{
		userId = crypto.randomUUID(),
		fullName = '',
		handphone = '',
		email = '',
		accountStatus = 'pending_passkey_creation',
		trustLevel = 1,
	} = {},
) {
	const lookupHashes = accountLookupHashes({ email, handphone });
	const existing = await findExistingSignaturaIdentity(client, lookupHashes);
	if (existing) {
		return {
			identity: existing,
			created: false,
			lookupHashes,
		};
	}

	const identity = await createSignaturaIdentity(client, {
		userId,
		fullName,
		handphone,
		email,
		...lookupHashes,
		accountStatus,
		trustLevel,
	});
	return {
		identity,
		created: true,
		lookupHashes,
	};
}

async function createPendingInvitationIdentity(client, options = {}) {
	return createSignaturaIdentity(client, {
		accountStatus: 'pending_passkey_creation',
		trustLevel: 1,
		withEncryptedPrivateFields: false,
		...options,
	});
}

export {
	IDENTITY_BOOTSTRAP_ORDER,
	createPendingInvitationIdentity,
	createSignaturaIdentity,
	findExistingSignaturaIdentity,
	resolveIdentityForRegistration,
};
