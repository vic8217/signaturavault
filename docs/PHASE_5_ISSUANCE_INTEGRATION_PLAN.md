# Phase 5 — Request-to-Issuance Integration Plan

**Status:** Plan only — **not implemented** (awaiting approval)  
**Goal:** Connect issuer request workflow to Signatura document issuance so that an **Issued** request results in a credential visible at `/signatura/documents`.  
**Scope:** Architecture review, linkage model, Prisma/API/UI/security/migration design. No notifications, no automated email/SMS/push.

---

## Executive summary

Today the request workflow can reach **Issued**, but wallet delivery is a boolean flag with no backing credential list. Issuance APIs write to the **JSON dev registry**, while request issue validation reads **Prisma** — so linkage is fragile in integrated environments.

**Recommended approach:** Hybrid **Option B primary, Option A fallback**, preceded by a **persistence unification** sub-step (5.0). On issue, atomically create or link a `DocumentRecord`, write an immutable `IssuedDocument` linkage row, bind `ownerUserId`, set `walletDelivered` from actual ownership binding, and expose a safe owner credential API + UI section on `/signatura/documents`.

---

## 1. Current issuance architecture review

### 1.1 Document tables

| Store | Model / table | Role today |
|-------|---------------|------------|
| **Prisma** | `DocumentRecord` | Verification anchor: hash, tokens, anchor status, tenant/issuer scope |
| **Prisma** | `DocumentRequest` | Owner→issuer workflow; `issuedDocumentRecordId`, `walletDelivered` |
| **Prisma** | `EncryptedPrivateField` | Zero-trust storage (`recordType: document_request`) |
| **Prisma** | `VerificationToken` | Expiring verify tokens tied to `documentRecordId` |
| **Prisma** | `AnchorPool`, `MerkleBatch`, `MerkleProof` | Post-issuance anchoring pipeline |
| **JSON dev DB** | `document_records`, `anchor_pool`, `verification_tokens` | **Primary write path** for issuer API issuance today |

**Key files:** `prisma/schema.prisma`, `src/lib/db.js`, `src/app/api/issuers/[tenantId]/documents/route.js`

### 1.2 Document ownership model

| Actor | Current ownership signal |
|-------|--------------------------|
| **Document owner** | `DocumentRequest.ownerUserId` — strong, Prisma-backed |
| **Issued document** | **No `ownerUserId`** on `DocumentRecord` — cannot query “my credentials” |
| **Linkage** | `DocumentRequest.issuedDocumentRecordId` (optional string, no FK) |

Owner wallet messaging (`walletDelivered`) is decoupled from any document row the owner can list.

### 1.3 Issuer ownership model

| Layer | Scope |
|-------|-------|
| `Issuer.tenantId` | Tenant boundary for templates, types, requests, records |
| `IssuerUser` | Staff membership (`ISSUER_ADMIN`, `ISSUER_STAFF`) |
| `DocumentRecord.tenantId` + `issuerId` | Issuer-tenant scoped issued credentials |
| Issuer API | API-key auth per `tenantId` (`authenticateApiRequest`) |

Issuers can list documents via `GET /api/issuer/documents` (JSON DB, tenant-filtered). Request inbox is Prisma-backed (`/api/issuer/requests`).

### 1.4 Wallet / document storage model

- **No `Wallet` or `WalletCredential` Prisma model.** “Wallet” is a portal namespace (`/signatura/*`, legacy `/wallet/*` redirects).
- **`/signatura/documents`** renders `DocumentRequestsPanel` — request inbox only, not issued credentials.
- **`/wallet/credentials`** is a static stub (“No documents yet”).
- **Issued credential list API:** does not exist (`GET /api/users/documents` or equivalent).

Storage for issued credentials is **`DocumentRecord` metadata + hash** — not encrypted document payloads. Content integrity is hash-based; PII fields (`recipientName`, `externalId`, `metadata`) are redacted in verification APIs.

### 1.5 Verification model

| Entry | Storage | Behavior |
|-------|---------|----------|
| `GET/POST /api/issuers/[tenantId]/verify` | JSON DB | Hash match, Merkle proof, expiry; `redactedDocumentVerification` |
| `GET /api/verify/[token]` | Prisma | Lighter response; redacts PII; anchor/Merkle metadata |
| QR scan (`/signatura/documents/scan`) | Routes to `/verify?token=` | Public verify UX partially wired |
| `/verify` page | Static placeholder | Not fully API-connected |

**Per record:** `verificationToken`, `qrToken`, `hash` / `documentHash`, `status`, `anchorStatus`.  
**Anchoring:** triggered after issuance via `anchor_pool` → Merkle batching — **not** on request workflow (per v1 decision #10).

### 1.6 Current request → issue flow (Phases 4 / 4A)

```
approved → POST /api/issuer/requests/[id]/issue
  → optional documentRecordId (validated in Prisma)
  → walletDeliveryAvailable → walletDelivered
  → status = issued, issuedAt set
  → audit document_request_issued
```

**Gaps:**
- Issuer API creates records in JSON; issue validation reads Prisma → link often fails in dev unless manually seeded.
- `walletDelivered` is a manual checkbox, not derived from owner binding.
- Owner detail API does not expose linked `documentId` or verification status.
- `IssuerTemplateIssuancePanel` has no submit / create path.

---

## 2. Issuance integration options

### Option A — Link existing `documentRecordId`

**Flow:** Issuer creates document first (API or future portal issuance) → on request issue, paste/select `documentRecordId` → validate tenant + issuer → set `issuedDocumentRecordId`.

| Pros | Cons |
|------|------|
| Minimal change; aligns with Phase 4A validation | Requires issuer to run two-step manual process |
| Works for API-first integrators | JSON/Prisma split breaks validation unless unified |
| No new document creation logic in issue handler | Does not bind `ownerUserId` unless extended |

**Already partially implemented:** `resolveValidatedIssuedDocumentRecordId`, issuer issue API + UI field.

### Option B — Create new `DocumentRecord` on issue

**Flow:** On `POST .../issue`, service creates `DocumentRecord` from approved request context (tenant, issuer, template, owner, hash from issuance step) → links to request → sets wallet delivery.

| Pros | Cons |
|------|------|
| Single issuer action from request inbox | Requires hash/source-of-truth input (file upload, template render, or API-provided hash) |
| Can set `ownerUserId` + `documentRequestId` at creation | Template issuance UI must be completed or hash supplied externally |
| Enables true wallet automation | Must unify Prisma writes for records + anchor pool |

### Recommended: **Hybrid (B primary, A fallback)**

| Scenario | Path |
|----------|------|
| Issuer uses **request inbox** “Mark issued” without pre-existing record | **Option B** — create `DocumentRecord` + linkage (hash required from issuance sub-step or deferred anchor-pending) |
| Issuer already created doc via **issuer API** or **issuance portal** | **Option A** — link by `documentRecordId`; backfill `ownerUserId` + `documentRequestId` on link |
| `walletDeliveryAvailable=true` | Set `walletDelivered=true` **only if** `ownerUserId` is bound on linked/created record |

**Prerequisite 5.0 — Persistence unification:** All `DocumentRecord` creates/updates (issuer API, portal issuance, request issue) must write to **Prisma** as source of truth. JSON registry becomes read-through fallback with warning-only (per workflow v1 decision #7), or dual-write during transition.

---

## 3. Owner delivery flow (target)

### Trigger

When issuer marks request **Issued** with `walletDeliveryAvailable=true` **and** linkage + owner binding succeed.

### Owner experience at `/signatura/documents`

Split page into two sections (tabs or stacked):

1. **My credentials** (new) — issued documents delivered to wallet  
2. **My requests** (existing) — request workflow inbox

**Credential card fields (safe metadata only):**

| Field | Source |
|-------|--------|
| Document name | `documentTypeLabel` from request or template name |
| Issuer | `Issuer.name` |
| Issued date | `DocumentRecord.issuedAt` or `DocumentRequest.issuedAt` |
| Verification status | `DocumentRecord.status` + `anchorStatus` (e.g. “Valid · Anchoring pending”) |

**No decrypted request fields** (purpose, notes, privateReference) in credential list.  
**Optional:** link to verify URL using owner-scoped safe token reference (not raw PII).

### Owner APIs (new)

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/users/documents` | List owner credentials (`walletDelivered` + bound `ownerUserId`) |
| `GET` | `/api/users/documents/[documentId]` | Safe detail + verification summary |

Filter rule:

```text
DocumentRecord.ownerUserId = session.userId
AND EXISTS IssuedDocument WHERE request.status = 'issued' AND walletDelivered = true
```

Or equivalent join via `DocumentRequest.issuedDocumentRecordId`.

---

## 4. Request–document linkage model

### Proposed: `IssuedDocument` table (immutable linkage record)

Explicit join as required by Phase 5 scope:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | cuid | Primary key |
| `requestId` | FK → `DocumentRequest.id` | Source request |
| `documentId` | FK → `DocumentRecord.id` | Issued credential |
| `issuerId` | string | Denormalized issuer |
| `ownerId` | string | Denormalized owner (`ownerUserId`) |
| `tenantId` | string | Tenant scope |
| `linkageType` | enum | `created` \| `linked` (B vs A) |
| `createdAt` | DateTime | Linkage timestamp |
| `createdByUserId` | string? | Issuer staff actor |

**Constraints:**
- One active `IssuedDocument` per `requestId` (unique on `requestId`)
- `documentId` unique per request (one credential per fulfilled request in v1)

### Denormalized fields on `DocumentRecord` (for query performance)

| New field | Purpose |
|-----------|---------|
| `ownerUserId` | Owner wallet queries |
| `documentRequestId` | Reverse lookup; revocation coupling |
| `documentTypeLabel` | Safe display name without joining request |

Keep `DocumentRequest.issuedDocumentRecordId` for backward compatibility; treat `IssuedDocument` as canonical linkage audit trail.

---

## 5. Zero Trust Level 2 preservation

| Role | Issued documents | Request private fields |
|------|------------------|------------------------|
| **Platform admin** | Counts / status / issuer name only; **no** hash plaintext content, **no** decrypt | Summary only (existing) |
| **Issuer staff** | Issue, verify status, revoke; decrypt **request** fields for review only | Tenant wrap decrypt (A1) |
| **Document owner** | Own credentials list (metadata + verification status); **no** platform-wide browse | Own request detail + denial reason |

**Document content:** Continue hash-only integrity model. Do not store decrypted document payloads in `DocumentRecord`. Template field values at issuance remain out of scope for Phase 5 unless already encrypted via future `recordType: document_record` path.

**Audit:** Extend `document_request_issued` details with `documentId`, `linkageType` — never request private fields or document content.

---

## 6. Verification impact

| Concern | Impact | Phase 5 action |
|---------|--------|----------------|
| **QR verification** | Unaffected — still `qrToken` on `DocumentRecord` | Ensure created/linked records get tokens (same as issuance API today) |
| **Verification token** | `VerificationToken` row + record tokens | Create on Option B; preserve on Option A link |
| **Document hash** | Required for verify + anchor | Issue flow must require or generate hash before `status=issued` **or** allow `issued` with `anchorStatus=pending` and hash placeholder policy (recommend: **require hash** for wallet delivery) |
| **Audit trail** | `document_request_issued` + new `document_linked_to_request` optional | Log linkage in `AuditLog`; `api_logs` for issuer API creates |
| **Revocation** | `DocumentRecord.status = revoked` | Owner credential list shows revoked state; request remains `issued` (no auto-rollback) |

**No anchoring on request endpoints** — anchoring continues post-issuance via existing `anchor_pool` pipeline.

---

## 7. Prisma changes (proposed)

### 7.1 New model: `IssuedDocument`

```prisma
model IssuedDocument {
  id              String   @id @default(cuid())
  tenantId        String   @map("tenant_id")
  requestId       String   @unique @map("request_id")
  documentId      String   @map("document_id")
  issuerId        String   @map("issuer_id")
  ownerId         String   @map("owner_id")
  linkageType     String   @map("linkage_type") // created | linked
  createdByUserId String?  @map("created_by_user_id")
  createdAt       DateTime @default(now()) @map("created_at")

  request  DocumentRequest @relation(fields: [requestId], references: [id])
  document DocumentRecord  @relation(fields: [documentId], references: [id])

  @@index([ownerId])
  @@index([issuerId])
  @@index([documentId])
  @@map("issued_documents")
}
```

### 7.2 Extend `DocumentRecord`

```prisma
ownerUserId        String?  @map("owner_user_id")
documentRequestId  String?  @unique @map("document_request_id")
documentTypeLabel  String?  @map("document_type_label")

@@index([ownerUserId])
```

### 7.3 Extend `DocumentRequest` (optional FK hardening)

```prisma
issuedDocument DocumentRecord? @relation(fields: [issuedDocumentRecordId], references: [id])
issuedLink     IssuedDocument?
```

### 7.4 Migration notes

- Backfill not required for greenfield; existing `issued` requests without records stay as-is.
- Optional backfill script: for rows with `issuedDocumentRecordId` set, create `IssuedDocument` + set `DocumentRecord.ownerUserId` from request.

---

## 8. API changes (proposed)

### 8.1 Sub-phase 5.0 — Persistence unification

| Change | Detail |
|--------|--------|
| Refactor `POST /api/issuers/[tenantId]/documents` | Write `DocumentRecord`, `AnchorPool`, `VerificationToken` to **Prisma** |
| Refactor `GET /api/issuer/documents` | Read Prisma first; JSON fallback + warning |
| Align verify routes | Single Prisma path for `/api/verify/[token]`; deprecate JSON-only verify over time |

### 8.2 Sub-phase 5.1 — Issue integration

| Method | Route | Change |
|--------|-------|--------|
| `POST` | `/api/issuer/requests/[requestId]/issue` | Orchestrate Option A or B; create `IssuedDocument`; bind owner; set `walletDelivered` from binding |
| `POST` | `/api/issuer/requests/[requestId]/issue` body | Add optional `documentHash` (required for Option B create); keep optional `documentRecordId` (Option A) |

**Issue orchestration (pseudocode):**

```text
if documentRecordId provided:
  validate Prisma record (tenant + issuer)
  backfill ownerUserId + documentRequestId on DocumentRecord
  linkageType = linked
else if documentHash provided:
  create DocumentRecord (tokens, anchor pending, ownerUserId, documentRequestId)
  enqueue anchor_pool
  linkageType = created
else:
  allow issue without wallet delivery only (walletDelivered=false)
  OR reject if walletDeliveryAvailable=true without hash/link

create IssuedDocument row
update DocumentRequest (issued, issuedDocumentRecordId, walletDelivered)
audit document_request_issued
```

### 8.3 Sub-phase 5.2 — Owner credential APIs

| Method | Route | Auth |
|--------|-------|------|
| `GET` | `/api/users/documents` | `DOCUMENT_OWNER` |
| `GET` | `/api/users/documents/[documentId]` | `DOCUMENT_OWNER`, own rows only |

**Safe DTO (`documentToOwnerCredentialSummary`):**

- `documentId`, `documentName`, `issuerDisplayName`, `issuedAt`, `verificationStatus`, `anchorStatus`, `walletDeliveryAvailable`
- Exclude: `hash`, tokens, `recipientName`, `externalId`, `metadata`

### 8.4 Sub-phase 5.3 — Issuer helpers (optional)

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/issuer/requests/[requestId]/issue-options` | List tenant `DocumentRecord` candidates not yet linked (Option A picker) |

---

## 9. UI changes (proposed)

### 9.1 Owner — `/signatura/documents`

| Component | Change |
|-----------|--------|
| `DocumentRequestsPanel` | Split into `OwnerCredentialsPanel` + existing requests panel |
| Credentials section | Fetch `GET /api/users/documents`; show name, issuer, date, verification badge |
| Issued request row | When `walletDelivered`, show “View in My credentials” link |
| Remove / soften | Static “No issued credentials yet” placeholder when credentials exist |

### 9.2 Issuer — `/issuer/requests`

| Component | Change |
|-----------|--------|
| `IssuerRequestsPanel` — Mark issued | Mode toggle: **Link existing record** vs **Create from hash** |
| Link mode | Search/select validated `documentRecordId` (Option A) |
| Create mode | Require `documentHash` input or “Issue from template” button (future 5.4) |
| `walletDeliveryAvailable` | Auto-check when owner binding will succeed; disable if no hash/link |
| Label | Keep “Document record ID” for link mode; “Document hash” for create mode |

### 9.3 Issuer — `/issuer/issuance` (deferred 5.4)

Wire `IssuerTemplateIssuancePanel` submit → create `DocumentRecord` with hash → optionally deep-link to request issue. Not required for MVP if hash paste on issue is sufficient.

### 9.4 Verify UX (low priority)

Wire `/verify` page to `GET /api/verify/[token]` for scan continuity.

---

## 10. Security review

| Threat | Mitigation |
|--------|------------|
| Owner A sees Owner B’s credential | All queries filter `ownerUserId = session.userId`; `IssuedDocument.ownerId` checked |
| Issuer links record to wrong tenant | `resolveValidatedIssuedDocumentRecordId` + issuer context |
| Platform admin reads document content | No content field; admin APIs exclude owner credentials; redaction on verify |
| Leak PII in owner credential API | Whitelist DTO; no `recipientName` / `externalId` / request decrypt fields |
| Forged `walletDelivered` without binding | Server sets `walletDelivered` only when `IssuedDocument` + `ownerUserId` on record |
| Token exposure to owner | Do not return `verificationToken`/`qrToken` in owner list; optional “Verify” link uses opaque owner-scoped route |
| Audit leakage | Linkage audit: ids + statuses only |

---

## 11. Migration plan

### Phase 5.0 — Foundation (1–2 PRs)

1. Prisma migration: `IssuedDocument`, `DocumentRecord` extensions  
2. Unified `createDocumentRecord()` service (Prisma write + anchor pool)  
3. Refactor issuer API `POST /documents` to use service  
4. Tests: create record in Prisma; verify tenant path works  

### Phase 5.1 — Issue linkage (1 PR)

1. Extend `issueIssuerDocumentRequest` with Option A/B orchestration  
2. Create `IssuedDocument` atomically in transaction  
3. Update issuer issue UI (hash / link modes)  
4. Tests: issue+link, issue+create, walletDelivered rules  

### Phase 5.2 — Owner delivery (1 PR)

1. `GET /api/users/documents` + detail  
2. Owner credentials UI on `/signatura/documents`  
3. Tests: owner sees only own credentials; denied request fields still isolated  

### Phase 5.3 — Hardening (1 PR)

1. Issuer document list Prisma migration  
2. Optional backfill for existing issued requests  
3. Verify/scan smoke tests  
4. Update `DOCUMENT_REQUEST_WORKFLOW_V1.md` phase table  

**Rollout:** Feature-flag `SIGNATURA_REQUEST_ISSUANCE_LINKAGE=true` for staged enable.

---

## 12. Implementation phases (recommended order)

| Step | Name | Deliverable |
|------|------|-------------|
| **5.0** | Persistence unification | Prisma-backed `DocumentRecord` creation |
| **5.1** | Linkage model | `IssuedDocument` + issue orchestration |
| **5.2** | Owner wallet UI | Credentials list on `/signatura/documents` |
| **5.3** | Issuer UX polish | Record picker, hash input, issuance panel wire-up |
| **5.4** | Template issuance | Full portal create-from-template (optional) |

---

## 13. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| JSON/Prisma split | **High** | 5.0 blocks all other work |
| Hash not available at issue time | **High** | Require hash for wallet delivery; allow issue-without-wallet otherwise |
| Dual meaning of `walletDelivered` | Medium | Derive from binding success; document in plan |
| Template issuance UI incomplete | Medium | Hash paste path for MVP; template submit in 5.4 |
| Verification dual paths (JSON vs Prisma) | Medium | Consolidate on Prisma in 5.0 |
| No FK today on `issuedDocumentRecordId` | Low | Add `IssuedDocument` + optional Prisma relation |
| Revoked document still shows issued request | Low | Credential card shows `revoked`; owner messaging TBD |
| Owner expects document file download | Medium | v1 is verify/metadata only — set UX expectations |
| Encrypted template fields at issuance | Medium | Defer `document_record` encrypted fields to later phase |

---

## 14. Out of scope (confirmed)

- Email, SMS, push notifications  
- Automated issuance from template without issuer action  
- Automated wallet push without linkage  
- API route renaming  
- Anchoring on request workflow  
- Platform admin decrypt paths  

---

## 15. Acceptance criteria (Phase 5 implementation)

- [ ] Approved request → issue → `IssuedDocument` row with `requestId`, `documentId`, `issuerId`, `ownerId`
- [ ] `walletDeliveryAvailable=true` → owner sees credential at `/signatura/documents`
- [ ] Owner credential shows document name, issuer, issued date, verification status
- [ ] Option A (link) and Option B (create) both work against **Prisma** records
- [ ] Platform admin cannot read document content or decrypt request fields
- [ ] Verification tokens + hash + anchor pipeline unchanged for new records
- [ ] `npm test` + `npm run build` pass

---

## 16. Key file touch list (when implemented)

| Area | Paths |
|------|-------|
| Schema | `prisma/schema.prisma`, new migration |
| Linkage service | `src/lib/document-request-issuance.js` (new) |
| Record service | `src/lib/document-records.js` (new or extend) |
| Issue handler | `src/lib/document-request-issuer.js` |
| Issuer API | `src/app/api/issuers/[tenantId]/documents/route.js` |
| Owner API | `src/app/api/users/documents/` (new) |
| Owner UI | `src/components/DocumentRequestsPanel.js`, `OwnerCredentialsPanel.js` (new) |
| Issuer UI | `src/components/IssuerRequestsPanel.js` |
| Tests | `test/document-request-issuance.integration.test.mjs` (new) |
| Docs | `docs/DOCUMENT_REQUEST_WORKFLOW_V1.md` |

---

*Plan produced for Phase 5 approval. No code changes until explicitly approved.*
