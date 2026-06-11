# Architecture A1 — Submit-Time Issuer Wrapping for Document Requests

**Status:** Approved — implementation in progress  
**Blocks:** Phase 4 (issuer approval workflow) until complete  
**Supersedes:** Per-issuer HOA device vault enrollment for document request submit

---

## Problem

Phase 3 required owners to import each issuer’s HOA key into the device vault (`/hoa-key/setup`) before submitting a document request. Registration only provisions:

- Signatura ID
- Trusted device (passkey)
- Recovery phrase

That mismatch blocked real owner submissions and is incompatible with multi-issuer UX.

---

## Decision

Use **submit-time issuer wrapping (Model A refined)**:

- Request fields remain **issuer-tenant** `EncryptedPrivateField` records.
- Ciphertext stays compatible with issuer review decrypt (via tenant wrap key).
- Owners **do not** persist per-issuer HOA keys in the device vault.
- Owners **do not** use `/hoa-key/setup` in the request flow.

Issued documents (future) remain **issuer-keyed** — unchanged by A1.

---

## Architecture

### Request flow (new)

```
Owner (DOCUMENT_OWNER + trusted device)
  ↓
Select issuer → load document types → load form schema
  ↓
form-schema.encryption = { keyRef, mode: "submit_wrap", ready, requiresTrustedDevice }
  ↓
Submit:
  1. Passkey re-verify (trusted device proof)
  2. POST /api/users/issuers/[issuerId]/document-request-encryption-session
  3. Server derives tenant wrap key (in-memory delivery over TLS)
  4. Client encrypts fields (memory only, never persisted)
  5. POST /api/users/document-requests with encryptedFields
  ↓
Store EncryptedPrivateField (issuer tenantId, issuer keyRef, recordType=document_request)
```

### Wrap key model

| Property | Value |
|----------|--------|
| Derivation | `HMAC-SHA256(SIGNATURA_DOCUMENT_REQUEST_WRAP_KEY, tenantId:keyRef:document_request_wrap_v1)` |
| Delivery | One-time API response after trusted-device re-verify (5 min session metadata) |
| Storage | **Never** stored in owner vault; not written to DB |
| Ciphertext format | Unchanged AES-256-GCM + canonical AAD (`v1:tenantId:recordType:recordId:fieldKey:keyRef:version`) |

### Encryption readiness (updated)

| | Old | New (A1) |
|---|-----|----------|
| Issuer | Active `keyRef` in DB | Same |
| Owner vault | HOA key for issuer `tenantId` | **Not required** |
| Trusted device | Implicit | **Required** |
| Submit | Vault key available | **Re-verify + encryption-session + in-memory wrap key** |

**Client UI ready when:** `encryption.keyRef` present (issuer enrolled).  
**Submit ready when:** passkey re-verify succeeds and encryption-session returns `wrapKey`.

### Issuer decrypt (Phase 4 prep)

Issuer staff continue using **existing ZT authorization** (`authorizePrivateFieldAccess`, audit, tenant membership, trusted device).

For `recordType = document_request`, decrypt uses **tenant wrap key derivation** on the server (`document-request-wrap-decrypt.mjs`) after authorization — not HOA vault unlock.

HOA / HOA-tenant private records are unchanged.

### Platform admin

- No decrypt API for `document_request` private fields.
- `assertPlatformAdminCannotDecrypt` unchanged.
- Wrap master secret is server-only (`SIGNATURA_DOCUMENT_REQUEST_WRAP_KEY`).

---

## Affected files

| File | Change |
|------|--------|
| `src/lib/document-request-wrap-key.mjs` | **New** — deterministic wrap key derivation |
| `src/lib/document-request-wrap-decrypt.mjs` | **New** — issuer-side decrypt helper (Phase 4) |
| `src/lib/document-request-encryption-session.js` | **New** — session issuance + audit |
| `src/app/api/users/issuers/[issuerId]/document-request-encryption-session/route.js` | **New** API |
| `src/lib/document-request-encryption.js` | **Rewrite** — remove HOA vault; submit-time session |
| `src/lib/document-requests.js` | `encryption.mode = submit_wrap` |
| `src/components/DocumentRequestsPanel.js` | Readiness UX; pass `issuerId` to encrypt |
| `test/document-request-wrap.test.mjs` | **New** — wrap round-trip tests |
| `docs/ARCHITECTURE_A1_DOCUMENT_REQUEST_WRAP.md` | This document |

**Not changed (explicitly out of scope):**

- `/hoa-key/setup` — remains for HOA/HavenxSig flows
- Owner-copy encryption
- Phase 4 issuer inbox UI
- `EncryptedPrivateField` schema
- Issued document encryption

---

## Migration impact

| Area | Impact |
|------|--------|
| **Database** | None — no schema migration |
| **Existing requests** | None — no production requests expected pre-A1 |
| **Owners** | Remove vault enrollment step; submit after trusted device only |
| **Issuers** | Must have active `PrivateFieldKeyReference` (same as before `acceptsRequests`) |
| **Env** | Add `SIGNATURA_DOCUMENT_REQUEST_WRAP_KEY` in production (falls back to dev secret locally) |
| **Phase 3 clients** | Any cached HOA vault entries for issuers are **ignored** by request encrypt path |

---

## Security review

| Control | A1 behavior |
|---------|-------------|
| Plaintext in DB | Still prohibited — `assertEncryptedSubmitPayload` |
| Plaintext in audit | Still prohibited |
| TLS | Wrap key delivered only over authenticated HTTPS |
| Trusted device | Required — `reverifyPasskey` + `hasRecentVerification` on session API |
| Wrap key persistence | Not written to localStorage / vault |
| Tenant isolation | Ciphertext still scoped to issuer `tenantId` + `keyRef` |
| Provider admin decrypt | Blocked — wrap master is ops secret, not exposed to admin UI |
| Issuer staff decrypt | Requires existing ZT authorization chain (Phase 4 wires decrypt helper) |
| Rate limiting | Encryption-session should inherit auth rate limits (future hardening) |

### Residual risks

1. **Wrap master secret** — Compromise allows decrypt of all document-request fields (same class as `SIGNATURA_FIELD_ENCRYPTION_KEY`). Rotate via env + re-encrypt strategy (future).
2. **Wrap key in browser memory** — Visible for short window during submit; acceptable tradeoff vs per-issuer vault.
3. **Deterministic wrap key** — Same tenant+keyRef always yields same key; security relies on master secret + authorization, not key randomness per session.
4. **Phase 4 not yet wired** — Decrypt helper exists; issuer inbox must call it after authorization.

---

## Implementation phases

| Phase | Scope | Status |
|-------|-------|--------|
| **A1.1** | Wrap key lib + encryption-session API + audit | Done |
| **A1.2** | Client encrypt path (no vault) + readiness fix + UI copy | Done |
| **A1.3** | Issuer decrypt helper + ZT integration in encrypted-payloads for `document_request` | Prep only (`wrap-decrypt` lib) |
| **A1.4** | Tests + docs + `npm run build` / `npm test` | **Done** (121 tests, build pass) |
| **Phase 4** | Issuer inbox / approve / deny | **Unblocked** — wire `document-request-wrap-decrypt` into ZT read path |

---

## Acceptance criteria (A1 complete)

- [x] Owner can submit without `/hoa-key/setup` or issuer vault import
- [x] Registration path unchanged (Signatura ID + trusted device + recovery phrase)
- [x] `encryption-session` requires DOCUMENT_OWNER + trusted device + recent passkey verification
- [x] Ciphertext stored on issuer tenant with issuer `keyRef`
- [x] Platform admin cannot decrypt request fields via existing APIs
- [x] Readiness definition updated (no vault check)
- [x] Tests cover wrap derive + encrypt/decrypt round-trip
- [x] Build and test pass

---

## Owner onboarding (final)

```
Register → Signatura ID → Trusted Device → Recovery Phrase → Dashboard
                                                      ↓
                              /signatura/documents → Request Digital Copy
                                                      ↓
                              Submit-time encrypt (no issuer key import)
```
