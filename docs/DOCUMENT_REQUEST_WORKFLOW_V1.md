# Issuer Document Request Workflow v1

**Status:** Approved — Phase 1 implemented (schema + core service).  
**Scope:** Document owners request digital copies from issuers; issuer staff review, approve, or deny; status becomes **Issued** when issuer-side document creation completes.

---

## Product decisions (locked)

| # | Decision |
|---|----------|
| 1 | **Request details:** DocumentTemplate-driven fields when a published template exists; fallback global form: `purpose`, `reference_number`, `notes`. |
| 2 | **Approval authority:** `ISSUER_ADMIN` and `ISSUER_STAFF` may review, approve, deny. Template publish/settings remain admin-only. |
| 3 | **Denied requests:** Owner may re-submit after denial. One active request per owner + issuer + document type while status is `pending` or `approved`. |
| 4 | **Issued linkage:** v1 = issuer-side document creation complete. Wallet delivery automatic if issuance already creates owner-accessible documents; else show “Digital copy ready for issuer release.” |
| 5 | **Notifications:** In-app only for v1. |
| 6 | **Public issuer list:** Only `acceptsRequests = true` and `status = active`. |
| 7 | **Source of truth:** Prisma. JSON registry empty → log warning only, do not block. |
| 8 | **Cancel:** Owner may cancel only while `pending`. |
| 9 | **Platform admin:** Counts + issuer name + status + timestamps + document type label only. No encrypted details or owner private content. |
| 10 | **Anchoring:** Not on request workflow. Applies after document issuance. |

---

## Data model

### `DocumentRequest` (routing + status metadata only)

| Field | Purpose |
|-------|---------|
| `id` | Primary key |
| `tenantId` | Issuer tenant |
| `issuerId` | Target issuer |
| `ownerUserId` | Requesting user |
| `documentTypeId` | Selected type |
| `documentTypeLabel` | Denormalized label for inbox/admin |
| `documentTemplateId` | Set when template-driven |
| `status` | `pending` \| `approved` \| `denied` \| `issued` \| `cancelled` |
| `referenceCode` | Workflow ID only (e.g. `REQ-2026-…`), never student/account number |
| `issuedDocumentRecordId` | Set on issue (Phase 6+) |
| `walletDelivered` | Owner wallet delivery flag |
| `reviewedByUserId` / `reviewedAt` | Issuer action |
| `submittedAt` / `issuedAt` / `cancelledAt` | Timestamps |

### `Issuer.acceptsRequests`

Boolean gate for public request picker.

### `EncryptedPrivateField`

| `recordType` | `document_request` |
| `recordId` | `DocumentRequest.id` |
| Sensitive values | `purpose`, `reference_number`, `notes`, template fields, `denial_reason` |

**Never** store student number, account number, or free-text notes on `DocumentRequest` or in audit `details`.

---

## Status machine

```
pending ──approve──► approved ──issue──► issued
   │                      │
   ├──cancel──► cancelled │
   └──deny──► denied       │
```

- Active uniqueness: `pending` + `approved` per `(ownerUserId, issuerId, documentTypeId)`.
- After `denied`, `cancelled`, or `issued`, owner may submit a new request.

---

## API routes (planned)

### Owner — `/api/users/document-requests`

- `GET` list own requests
- `POST` create (encrypted fields + routing metadata)
- `GET /[id]` detail
- `POST /[id]/cancel` (pending only)
- `GET .../issuers` (acceptsRequests + active)
- `GET .../document-types` + `form-schema`

### Issuer — `/api/issuer/requests`

- Inbox, detail, approve, deny, issue (Phases 3–6)

### Admin — `/api/admin/document-requests/summary`

- Aggregates only; whitelisted DTO

---

## UI routes (planned)

| Actor | Routes |
|-------|--------|
| Owner | `/signatura/documents`, `/signatura/documents/requests/new`, `/signatura/documents/requests/[id]` |
| Issuer | `/issuer/requests`, `/issuer/requests/[id]` |
| Admin | Summary card on `/admin/analytics` or `/admin/system` |

---

## RBAC

| Role | Access |
|------|--------|
| `DOCUMENT_OWNER` | Own requests; decrypt own encrypted fields |
| `ISSUER_ADMIN` / `ISSUER_STAFF` | Tenant-scoped requests; decrypt for review |
| `SIGNATURA_ADMIN` / `SIGNATURA_STAFF` | Summary counts/metadata only; **no decrypt** |

---

## Audit events

| Action | When |
|--------|------|
| `document_request_submitted` | Owner create |
| `document_request_cancelled` | Owner cancel (pending) |
| `document_request_approved` | Issuer approve (Phase 3+) |
| `document_request_denied` | Issuer deny (Phase 3+) |
| `document_request_issued` | Issue complete (Phase 6+) |
| `document_request_access_denied` | RBAC failure |

Details JSON must never contain plaintext request fields or denial text.

---

## Implementation phases

| Phase | Scope | Status |
|-------|-------|--------|
| **1** | Prisma schema, `document-requests` core service, validation, active uniqueness, audit helpers | **Done** |
| **2** | Issuer resolver, public issuer/type/form-schema APIs | Pending |
| **3** | Owner create/list/detail/cancel APIs | Pending |
| **4** | Issuer inbox/approve/deny/issue APIs + dashboard metric | Pending |
| **5** | Owner UI | Pending |
| **6** | Issuer UI + issuance linkage | Pending |
| **7** | Admin summary + hardening | Pending |

---

## Phase 1 deliverables

- `prisma/schema.prisma` — `DocumentRequest`, `Issuer.acceptsRequests`
- `src/lib/document-requests/constants.js` — status enum, audit action names
- `src/lib/document-requestsCore.mjs` — pure validation, transitions, admin DTO whitelist
- `src/lib/document-requests.js` — Prisma service: create, cancel, active lookup, issuer resolve
- `src/lib/document-request-audit.js` — audit event helpers
- `test/document-requests.test.mjs` — unit tests

---

## Acceptance criteria (full v1)

- [ ] Owner submit, cancel (pending), status visibility, re-submit after deny
- [ ] One active pending/approved per owner+issuer+type
- [ ] Issuer staff approve/deny/issue
- [ ] Issued wallet vs “ready for issuer release” messaging
- [ ] Admin summary without private content
- [ ] No anchoring on request endpoints
- [ ] Prisma issuer resolution with JSON registry warning-only
- [ ] All transitions audit-logged without private content
