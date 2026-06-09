# Signatura Zero Trust Level 2 Refactor Report

Report date: 2026-06-09

## Current Status

Signatura now standardizes on Zero Trust Level 2 for the active security model:

- Users must be authenticated.
- Access is limited by role and tenant.
- Sensitive private fields are stored as encrypted envelopes.
- Important access and mutation events are logged.
- Public security APIs are exposed under `/api/zero-trust/*`.
- Signatura describes only Zero Trust Level 2.

## Files Retained

- `src/app/api/zero-trust/key-references/enroll/route.js`
- `src/app/api/zero-trust/key-references/[keyRef]/route.js`
- `src/app/api/zero-trust/key-authorizations/route.js`
- `src/app/api/zero-trust/encrypted-payloads/route.js`
- `src/lib/security/privateFieldKeys.js`
- `src/lib/security/privateFieldKeysCore.mjs`
- `src/lib/security/encryptedFields.js`
- `src/lib/security/encryptedFieldsCore.mjs`
- `src/lib/security/zeroTrustActor.js`
- `src/lib/audit/index.js`
- `test/zero-trust-routes.integration.test.mjs`
- `test/security-redaction.test.js`

## Files Removed

- Earlier stronger-security audit document
- `src/security/encryption.service.ts`
- `src/security/authorization.service.ts`
- `src/security/consent-proof.service.ts`
- `src/security/audit.service.ts`
- Legacy compatibility routes outside `/api/zero-trust/*`

## Active Flow

```text
Signatura Zero Trust Level 2 API
  authenticates actor
  verifies role and tenant scope
  verifies passkey or trusted service session
  validates authorization purpose
  logs access decision
  stores or returns encrypted private-field envelopes
```

## Remaining Compatibility Debt

The Prisma model and table names still include earlier key-reference naming. They are internal persistence names only; the public route and documentation surface now uses Zero Trust Level 2 private-field key references. A future schema migration can rename those tables once production data migration is scheduled.

## Verification

- `npx prisma validate`
- `npm test`
- `npm run build`
