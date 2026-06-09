# Security Cleanup Report

Report date: 2026-06-09

## Scope

This cleanup reviewed repository code, schema, routes, UI copy, and documentation related to Zero Trust Level 2, encrypted fields, private fields, authentication, and audit logging.

## Files Reviewed

- `prisma/schema.prisma`
- `src/app/api/auth/*`
- `src/app/api/zero-trust/*`
- `src/app/api/admin/templates/[id]/file/route.js`
- `src/app/api/admin/templates/[id]/extract/route.js`
- `src/components/HoaKeySetupForm.js`
- `src/components/Marketing.js`
- `src/app/page.js`
- `src/app/wallet/page.js`
- `src/lib/security/privateFieldKeys.js`
- `src/lib/security/privateFieldKeysCore.mjs`
- `src/lib/audit/index.js`
- `src/lib/use-cases.js`
- `docs/SIGNATURA_ZERO_TRUST_REFACTOR_REPORT.md`
- `docs/ZERO_TRUST_GAP_ANALYSIS.md`
- Earlier stronger-security audit document

## Misleading Security Claims Removed

- Removed the earlier stronger-security audit document because it framed the implementation beyond Zero Trust Level 2.
- Removed unused contract-only placeholder modules:
  - `src/security/encryption.service.ts`
  - `src/security/authorization.service.ts`
	- `src/security/consent-proof.service.ts`
	- `src/security/audit.service.ts`
- Removed public legacy compatibility routes outside `/api/zero-trust/*`.

These files were not imported by active routes or tests and risked making the codebase look more complete than the live implementation.

## Zero Trust Code Retained

- Authentication and session controls.
- Signatura ID based login model.
- Passkey and trusted-device verification paths.
- Role-based access control.
- Tenant-scoped issuer/admin access checks.
- Encrypted private-field envelope storage and validation.
- Zero Trust Level 2 private-field key reference routes under `/api/zero-trust/*`.
- Audit logging through the active `auditEvent` path.
- QR/document verification logging and anchoring controls.
- Secure recovery-code flow for Signatura ID based recovery.

## Sensitive Plaintext Fields Found

The schema still contains plaintext-capable legacy or issuer workflow fields that should remain deprecated, encrypted, hashed, purged, or tenant-controlled before production compliance is claimed:

- `User.email`
- `User.name`
- `Issuer.contactEmail`
- `Issuer.address`
- `Issuer.registrationNumber`
- `IssuerUser.email`
- `IssuerInvitation.email`
- `IssuerInvitation.recipient`
- `DocumentRecord.externalId`
- `DocumentRecord.recipientName`
- `DocumentRecord.metadata`

Recent hidden-contact migration work minimizes or purges several of these values for active auth flows, but the schema still permits plaintext unless later migrations remove or hard-block them.

## Recommended Schema Changes

- Keep `User.signaturaId` as the public operational identifier and `User.id` as the internal UUID.
- Remove or permanently deprecate `User.email` and `User.name`.
- Store private values as encrypted envelopes with `ciphertext`, `iv` or `nonce`, `tag`, `keyRef`, `aad`, and algorithm/version metadata.
- Use keyed lookup hashes for fields that must be unique or searchable, such as email, mobile number, recipient identifiers, and external IDs.
- Store lookup peppers outside the database in KMS/HSM or equivalent secret storage.
- Move issuer contact, recipient, document metadata, government ID, selfie, and uploaded document metadata into encrypted private-field records or tenant-owned systems.

## Required API Changes Still Open

- Continue removing plaintext contact fields from admin, issuer, support, export, and search responses.
- Keep normal login on `signaturaId + passkey + trusted device`.
- Keep sessions limited to operational identity metadata: `userId`, `signaturaId`, `role`, `trustLevel`, timestamps, and reauth metadata.
- Replace recipient/external ID search with keyed lookup hashes or tenant-side search.
- Keep new integrations on `/api/zero-trust/*`.

## Required UI Changes Still Open

- Admin and support screens should display only Signatura ID, account status, trust level, device count, last login, and audit references.
- Issuer/provider views should not display plaintext user contact, recipient, address, government ID, document metadata, or uploaded file metadata from Signatura-owned storage.
- Marketing and product copy should use:
  - "Zero Trust Level 2"
  - "Sensitive private fields are encrypted"
  - "Access is role-based and logged"
  - "The database should not expose readable private information"
- Copy should describe only Zero Trust Level 2 until stronger key custody and recovery guarantees are fully implemented and tested.

## Remaining Security Risks

- Legacy plaintext-capable schema fields still exist.
- Some internal persistence names still use earlier key-reference terminology and should be renamed in a dedicated schema migration.
- Provider and admin export/search surfaces need continued redaction review.
- File access for uploaded template/customer documents is intentionally denied for provider admins until Zero Trust Level 2 file-access controls are implemented.
- Full external key custody and recovery are not complete enough to claim stronger security than Zero Trust Level 2.

## Tests That Should Be Added

- Schema/API tests proving sensitive fields are stored only as encrypted envelopes or keyed hashes.
- Route tests proving auth responses and sessions never include email or name.
- Admin/support API tests proving plaintext contact, recipient, address, government ID, and document metadata are not returned.
- Login tests proving normal login works with Signatura ID, passkey, and trusted device without email/mobile lookup.
- Recovery tests proving recovery uses Signatura ID, recovery code, and passkey re-enrollment without admin-visible contact data.
- Audit tests proving important access and mutation events are logged with redacted details.
