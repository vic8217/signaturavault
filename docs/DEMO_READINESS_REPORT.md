# Signatura Demo Readiness Report — Issuer Document Requests

**Date:** 2026-06-08  
**Scope:** End-to-end demo for owner document requests (request → approve/deny → issue → owner status/credentials → public verify)  
**Verdict:** **Not demo-ready out of the box.** Backend flows are implemented and covered by integration tests (176/176 passing), but local/demo bootstrap requires manual account setup, tenant encryption enrollment, and issuer staff linking after seed. One public UI gap blocks QR verify in-browser.

**Explicitly out of scope for this report:** JSON retirement (R1/R2 paused). No code changes recommended here.

---

## Scope checklist

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | Owner can request a digital copy | **Conditional** | UI at `/signatura/documents`; needs trusted device, passkey reverify, and active `PrivateFieldKeyReference` for demo tenant |
| 2 | Issuer can approve or deny | **Ready** | `/issuer/requests` + `IssuerRequestsPanel`; staff decrypts encrypted fields server-side |
| 3 | Issuer can mark issued | **Ready** | Approve first, then “Mark issued” with optional hash/record ID and wallet delivery checkbox |
| 4 | Owner can see request status | **Ready** | Request list + detail on `/signatura/documents` |
| 5 | Owner sees credential metadata when wallet delivery exists | **Ready** | “My Credentials” section via `GET /api/users/documents` |
| 6 | Public verifier can verify QR/hash for issued records | **Partial** | `GET /api/verify/[token]` works; `/verify` page is a static shell (no API wiring) |

---

## Demo issuer (seeded)

Enable with:

```bash
SEED_REQUEST_DEMO_ISSUER=1 npx prisma db seed
```

| Field | Value |
|-------|-------|
| Tenant ID | `tenant_request_demo` |
| Tenant name | Request Demo University |
| Issuer ID | `issuer_request_demo` |
| Issuer name | Request Demo University |
| `acceptsRequests` | `true` |
| Document types | `doctype_request_transcript`, `doctype_request_enrollment` |
| Published template | `tpl_request_demo_transcript` → **Official Transcript** only |
| Template fields (encrypted) | `purpose` (textarea), `privateReference` (text, “Student number”) |

**Seed does not create:** users, `IssuerUser` rows, `PrivateFieldKeyReference`, trusted devices, sessions, or API keys. **Seed wipes all users and crypto state** on every run.

**Document type caveat:** “Enrollment Verification” has no published template, so it will not appear as a requestable type in the owner UI. Use **Official Transcript** for the demo.

---

## Required seed data (summary)

### Created automatically (when `SEED_REQUEST_DEMO_ISSUER=1`)

- `Tenant`: `tenant_request_demo`
- `Issuer`: `issuer_request_demo`, `acceptsRequests: true`, `status: active`
- `DocumentType`: transcript + enrollment types
- `DocumentTemplate`: published transcript form with encrypted fields
- HavenxSig OAuth client (base seed)

### Must be created manually before demo

| Record | Purpose |
|--------|---------|
| 3× `User` + `WebAuthnCredential` + `TrustedDevice` | Owner, issuer staff, platform admin (passkey registration) |
| `IssuerUser` (active) | Links issuer staff (and optionally issuer admin) to `tenant_request_demo` / `issuer_request_demo` |
| `PrivateFieldKeyReference` (active) | Unblocks encryption session + form schema `encryption.keyRef` |
| `SignaturaSession` + role cookies | Real login session; role cookie alone is insufficient for APIs |

Optional for full wallet + verify path:

- `DocumentRecord` created at issue time (from hash) — no pre-seed required
- `IssuedDocument` with `deliveryStatus: wallet_delivered` — created by issue flow when wallet checkbox is used

---

## Required test accounts

Use dedicated passkey accounts (register at `/register`). Suggested labels for demo narration:

| Persona | Suggested Signatura ID | Role cookie | Portal entry | DB linkage required |
|---------|------------------------|-------------|--------------|---------------------|
| **Document owner** | e.g. `SIG-DEMO-OWNER` | `DOCUMENT_OWNER` | `/signatura/documents` | None (owner is implicit via session) |
| **Issuer staff** | e.g. `SIG-DEMO-STAFF` | `ISSUER_STAFF` | `/issuer/requests` | Active `IssuerUser` for `tenant_request_demo` |
| **Platform admin** | e.g. `SIG-DEMO-ADMIN` | `SIGNATURA_ADMIN` | `/admin` (optional observer) | None for invite bootstrap |

### Account setup notes

1. **Passkey + trusted device** — Owner submit flow calls `reverifyPasskey()` then `POST /api/users/issuers/{issuerId}/document-request-encryption-session`. Requires:
   - Authenticated `signatura_session`
   - At least one active `TrustedDevice`
   - Recent passkey verification (`reauthenticatedAt` within **5 minutes**)

2. **Role cookie** — In non-production, set via home page “Portal access” buttons (`POST /api/auth/session`) or login finish. Production disables role switching.

3. **Issuer staff** — `requireIssuerContext` requires both `ISSUER_STAFF`/`ISSUER_ADMIN` cookie **and** an active `IssuerUser` row for the logged-in `userId`. Role cookie without `IssuerUser` returns `403 Active issuer account required`.

4. **Platform admin** — Can create issuer invitations via `/issuer/onboarding` (form posts to `POST /api/issuer-invitations` with `tenantId` + `issuerId`). Cannot decrypt request private fields (by design).

---

## Pre-demo setup (exact steps)

### A. Environment

```bash
# From repo root
cp .env.example .env   # if needed
# Ensure DATABASE_URL points at PostgreSQL
npm install
npx prisma migrate deploy   # or: npx prisma migrate dev
SEED_REQUEST_DEMO_ISSUER=1 npx prisma db seed
npm run dev:lan:https       # HTTPS helps camera QR; localhost OK for passkeys
```

Keep `NODE_ENV=development` so role switching works.

### B. Register three passkey accounts

For each persona (owner, issuer staff, platform admin):

1. Open `/register`
2. Complete passkey registration (creates user + trusted device)
3. Log in if needed
4. On home page, use **Portal access** to set the correct role cookie

### C. Link issuer staff to demo tenant

**Recommended:** Platform admin invites staff.

1. Log in as platform admin; set `SIGNATURA_ADMIN` role
2. Open `/issuer/onboarding`
3. Submit invite form:
   - `tenantId`: `tenant_request_demo`
   - `issuerId`: `issuer_request_demo`
   - `role`: `ISSUER_STAFF`
   - `deliveryChannel`: `SECURE_ENTERPRISE_CHANNEL`
4. Open returned activation URL (or copy from API response)
5. Complete `/issuer/activate` with the **issuer staff** passkey account
6. Set `ISSUER_STAFF` role cookie; confirm `GET /api/issuer/requests` returns 200

**Alternate (demo-only):** Insert active `IssuerUser` in Prisma Studio linking staff `userId` to `tenant_request_demo` / `issuer_request_demo`.

**Note:** `/admin/issuers` lists issuers from the JSON dev registry, not Prisma. The seeded demo issuer will **not** appear there. Use `/issuer/onboarding` with explicit tenant/issuer IDs.

### D. Enroll tenant encryption key (blocker removal)

Owner form shows *“This issuer is not ready for secure document requests yet”* until `PrivateFieldKeyReference` exists for `tenant_request_demo`.

**Recommended:** Issuer admin enrolls via HOA key setup.

1. Invite and activate an **ISSUER_ADMIN** for `tenant_request_demo` (same invitation flow as staff)
2. Log in as issuer admin; set `ISSUER_ADMIN` role
3. Open `/hoa-key/setup?tenantId=tenant_request_demo`
4. Complete HOA key enrollment (passkey reverify + enroll → creates `PrivateFieldKeyReference`)

**Verify readiness:**

```bash
# Owner session cookie required in browser; or check in Prisma Studio:
# private_field_key_references where tenant_id = 'tenant_request_demo' and status = 'active'
```

In UI: select demo issuer + **Official Transcript** — form should show encryption ready message (not amber warning).

### E. Optional: bootstrap issuer admin before staff

If you have no issuer admin yet, platform admin can invite `ISSUER_ADMIN` first (same API, `role: ISSUER_ADMIN`), activate, enroll key, then invite staff.

---

## Demo test script

**Narrative:** “Student requests transcript → registrar reviews encrypted details → approves → marks issued with wallet delivery → student sees credential → anyone verifies document.”

**Demo document hash (example):**

```
sha256:demo-transcript-2026-0042-deadbeefcafe
```

---

### Scene 0 — Preconditions

| Check | How | Expected |
|-------|-----|----------|
| Demo issuer seeded | Prisma / logs | `issuer_request_demo`, `acceptsRequests=true` |
| Encryption ready | Owner form schema | No amber “not ready” banner; Submit enabled |
| Owner trusted device | `/signatura/trusted-devices` or register flow | Device listed |
| Issuer staff linked | `/issuer/requests` as staff | HTTP 200, empty or populated list |
| All three logged in (separate browsers/profiles) | Sessions + role cookies | Portals open without proxy redirect |

---

### Scene 1 — Owner requests digital copy

**Actor:** Document owner  
**URL:** `/signatura/documents`

| Step | Action | Expected result |
|------|--------|-----------------|
| 1.1 | Click **Request Digital Copy** | Form opens |
| 1.2 | Issuer: **Request Demo University** | Document types load |
| 1.3 | Document type: **Official Transcript** | Fields: Purpose, Student number |
| 1.4 | Purpose: `Graduate school application` | — |
| 1.5 | Student number: `STU-2026-0042` | — |
| 1.6 | Click **Submit request** | Passkey reverify prompt |
| 1.7 | Approve passkey | Success message; request appears in list |
| 1.8 | Select request in list | Detail shows `Pending`, reference `REQ-…`, status message *“waiting for issuer review”* |

**API trail (optional):**

- `POST …/document-request-encryption-session` → 200 with `wrapKey`, `keyRef`
- `POST /api/users/document-requests` → 201

---

### Scene 2a — Issuer approves (happy path)

**Actor:** Issuer staff  
**URL:** `/issuer/requests`

| Step | Action | Expected result |
|------|--------|-----------------|
| 2a.1 | Filter: **Pending** | Owner’s request visible |
| 2a.2 | Select request | Decrypted fields: purpose + student number (not ciphertext) |
| 2a.3 | Click **Approve** | Status → `approved` |
| 2a.4 | Switch to owner browser | Status *“approved… preparing your document”* |

---

### Scene 2b — Issuer denies (alternate path)

**Actor:** Issuer staff (use a second request or reset DB)

| Step | Action | Expected result |
|------|--------|-----------------|
| 2b.1 | Enter denial reason: `Record not found` | — |
| 2b.2 | Click **Deny** | Status → `denied` |
| 2b.3 | Owner views detail | Denial reason visible to owner only (not in issuer list summary) |

---

### Scene 3 — Issuer marks issued with wallet delivery

**Actor:** Issuer staff  
**Precondition:** Request status `approved`

| Step | Action | Expected result |
|------|--------|-----------------|
| 3.1 | In **Mark issued**, enter document hash: `sha256:demo-transcript-2026-0042-deadbeefcafe` | Wallet checkbox enabled |
| 3.2 | Check **Deliver to owner Signatura wallet** | — |
| 3.3 | Click **Mark issued** | Status → `issued` |
| 3.4 | Owner refreshes `/signatura/documents` | Request status *“Digital copy is available in your Signatura wallet”* |
| 3.5 | Owner **My Credentials** section | Row: Official Transcript, Request Demo University, verification/anchor status, **Verify document** link |

**Without wallet delivery:** Leave hash empty and issue → owner sees *“ready for issuer release”*; My Credentials stays empty.

---

### Scene 4 — Public verification

**Actor:** Public verifier (no login)

| Step | Action | Expected result |
|------|--------|-----------------|
| 4.1 | From owner credential, copy `verifyUrl` token or use `qrVerifyUrl` | URL shape `/verify?token=…` |
| 4.2 | **Working path:** `GET /api/verify/{token}` | JSON: `token_valid: true`, `document_status`, `anchor_status`, redacted fields |
| 4.3 | **UI path:** Open `/verify?token=…` | **Blocker:** static page; input/button are not wired to API |
| 4.4 | **QR path:** `/signatura/documents/scan` or `/wallet/scan` → paste token | Redirects to `/verify?token=…` (same static page gap) |

**Example curl (replace token):**

```bash
curl -s "http://localhost:3000/api/verify/VER-XXXXXXXX" | jq .
```

Expected fields include `token_valid`, `document_status` (e.g. `valid`), `verification_token`, `qr_token`, `merkle_proof_available`.

---

### Scene 5 — Platform admin (observer)

**Actor:** Platform admin  
**URL:** `/admin` (and related admin panels)

| Step | Action | Expected result |
|------|--------|-----------------|
| 5.1 | View document-request summaries if exposed in admin UI | Counts/metadata only — **no private field decrypt** |
| 5.2 | Attempt issuer request detail decrypt APIs | Rejected — provider admins cannot decrypt |

---

## Expected results (acceptance)

After full happy-path demo:

1. One `DocumentRequest` in `pending` → `approved` → `issued` with `walletDelivered: true`
2. `EncryptedPrivateField` rows for purpose/privateReference (owner submit); optional `denial_reason` if denied path
3. `DocumentRecord` created from hash, linked to request and owner
4. `IssuedDocument` with `deliveryStatus: wallet_delivered`
5. Owner list/detail status messages match `buildOwnerStatusMessage` in `document-requestsCore.mjs`
6. Public verify API returns valid token payload for `verificationToken` or `qrToken` from the record

---

## Blockers

### Critical (must resolve before live demo)

| ID | Blocker | Impact | Mitigation |
|----|---------|--------|------------|
| B1 | **No `PrivateFieldKeyReference` after seed** | Owner cannot submit; form disabled | Issuer admin HOA enroll (`/hoa-key/setup?tenantId=tenant_request_demo`) |
| B2 | **Seed wipes all users** | No accounts after seed | Re-register passkeys; re-link `IssuerUser`; re-enroll key |
| B3 | **Issuer staff needs `IssuerUser` row** | `/issuer/requests` → 403 | Platform admin invite via `/issuer/onboarding` or manual DB link |
| B4 | **`/verify` page not functional** | QR/token UX dead-ends | Demo verify via `GET /api/verify/[token]` or curl; or fix in future sprint |
| B5 | **Owner submit needs trusted device + passkey reverify** | Submit fails mid-flow | Register with passkey; complete reverify when prompted |

### Moderate (work around in script)

| ID | Blocker | Impact | Mitigation |
|----|---------|--------|------------|
| B6 | Demo issuer absent from `/admin/issuers` registry | Cannot use admin table “Create invite” for seeded issuer | Use `/issuer/onboarding` with explicit IDs |
| B7 | Only **Official Transcript** has published template | Second document type not requestable | Narrate single type |
| B8 | Reauth window **5 minutes** | Encryption session fails if idle | Re-verify passkey before submit |
| B9 | Role cookie without session | Portal may open but APIs 401 | Always complete passkey login first |

### Low / by design

| ID | Note |
|----|------|
| B10 | Platform admin cannot decrypt request fields |
| B11 | Production disables `POST /api/auth/session` role switching |
| B12 | Camera QR requires HTTPS (ngrok / `dev:lan:https`) on non-localhost |

---

## Integration test references

Use these as behavioral spec if UI demo fails:

| Test file | Covers |
|-----------|--------|
| `test/document-request-owner.integration.test.mjs` | Encrypted submit, cancel, list |
| `test/document-request-issuer.integration.test.mjs` | Approve, deny, decrypt, issue |
| `test/document-request-issuance.integration.test.mjs` | Wallet delivery, hash → `DocumentRecord` |
| `test/document-records-phase52.integration.test.mjs` | Public verify, QR/hash |

---

## Route map (quick reference)

| Step | URL / API |
|------|-----------|
| Owner documents | `/signatura/documents` |
| Owner scan | `/signatura/documents/scan` |
| Issuer inbox | `/issuer/requests` |
| Encryption session | `POST /api/users/issuers/{issuerId}/document-request-encryption-session` |
| Owner submit | `POST /api/users/document-requests` |
| Issuer list/detail | `GET /api/issuer/requests`, `GET /api/issuer/requests/{id}` |
| Issuer approve/deny/issue | `POST …/approve`, `…/deny`, `…/issue` |
| Owner credentials | `GET /api/users/documents` |
| Public verify | `GET /api/verify/{token}` |
| Verify UI (gap) | `/verify` |
| HOA / tenant key | `/hoa-key/setup?tenantId=tenant_request_demo` |
| Staff invite | `/issuer/onboarding` → `POST /api/issuer-invitations` |
| Role switch (dev) | Home → Portal access / `POST /api/auth/session` |

---

## Readiness conclusion

**Backend:** Demo-ready — request encryption, issuer workflow, issuance with wallet delivery, owner credentials, and public verify API are implemented and tested.

**Operational demo:** Requires ~30–45 minutes of bootstrap per seed cycle (accounts, issuer invite, tenant key enrollment).

**UI demo gap:** Public verification page does not call the working verify API; plan to demonstrate verification via API response or owner credential link with verbal note until `/verify` is wired.

**Recommended next engineering items (when code work resumes):** extend seed with demo users + key reference + issuer staff; wire `/verify` client to `GET /api/verify/[token]`; add published template for enrollment type or hide unpublished types in picker.
