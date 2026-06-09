export {
	ENCRYPTED_FIELD_KEYS,
	PLAINTEXT_FIELD_KEYS,
	assertNoPlaintextPrivateField,
	canonicalPrivateFieldAad,
	encryptedPrivateFieldToApi,
	normalizeEncryptedPrivateField,
	validateAesGcmEnvelope,
	validateEncryptedFieldAccess,
	validateEncryptedFieldMutation,
} from './encryptedFieldsCore.mjs';
