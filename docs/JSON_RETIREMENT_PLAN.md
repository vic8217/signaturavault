# JSON Retirement Plan — Document & Anchoring Persistence

**Status:** Plan only — **not implemented** (awaiting approval)  
**Goal:** Fully retire JSON `data/db.json` storage for document issuance, verification, revocation, and anchoring; make Prisma the sole production source of truth.  
**Scope:** Document records, anchor pool, Merkle batches/proofs, verification tokens, and document-related API/audit log reads.  
**Out of scope (parallel track):** Issuer API key auth, issuer registration, webhooks, legacy issuer registry branding, admin issuer counts from JSON `issuers` — documented in §8.

---

## 1. Executive summary

Phases 5.0–5.3A migrated **new** document and anchoring workflows to Prisma-first with JSON read/write fallbacks. Production cutover requires four retirement phases:

| Phase | Purpose |
|-------|---------|
| **R1** | Stop all new JSON writes for document/anchoring tables |
| **R2** | Backfill legacy JSON rows into Prisma (idempotent) |
| **R3** | Remove JSON fallback reads |
| **R4** | Delete JSON persistence code for document/anchoring |

JSON `db.json` will remain on disk through R2–R3 as a read-only archive and rollback safety net. Full file deletion is optional after soak; other JSON tables (API keys, issuers) may continue until a separate issuer-registry retirement.

---

## 2. Current state (post Phase 5.3A)

### Prisma models (source of truth for new data)

- `DocumentRecord`, `VerificationToken`, `AnchorPool`, `MerkleBatch`, `MerkleProof`
- `ApiLog`, `AuditLog`, `SecurityAuditLog` (Prisma paths for new revoke/hash/QR ops)
- `IssuedDocument`, `DocumentRequest` (request workflow — already Prisma-only)

### JSON tables (document/anchoring relevant)

| JSON array | Prisma equivalent | Notes |
|------------|-------------------|-------|
| `document_records` | `DocumentRecord` | Dual read; legacy write on hash/revoke/QR |
| `verification_tokens` | `VerificationToken` | Legacy read in tenant verify + issuer dashboard counts |
| `anchor_pool` | `AnchorPool` | Dual queue; JSON batch job still writes |
| `merkle_batches` | `MerkleBatch` | Dual read; JSON batch job still writes |
| `merkle_proofs` | `MerkleProof` | Dual read; JSON batch job still writes |
| `api_logs` | `ApiLog` | Mixed: Prisma for new ops; JSON for verify POST audit |
| `audit_logs` | `AuditLog` | Mixed: Prisma for new revoke; JSON for legacy revoke |

---

## 3. Path classification

### 3.1 Document create / update

| Path | Classification | Notes |
|------|----------------|-------|
| `POST /api/issuers/[tenantId]/documents` | **Already migrated** | `createDocumentRecord()` → Prisma only |
| Request issue → `createDocumentRecordWithClient` | **Already migrated** | Transaction-safe linkage (5.1A) |
| `POST /api/issuers/[tenantId]/hashes` | **Read-only fallback + active JSON write** | Prisma-first; legacy JSON `saveDb` on old records |
| `POST /api/issuers/[tenantId]/revoke` | **Read-only fallback + active JSON write** | Prisma + `auditEvent`; legacy JSON revoke |
| `POST /api/issuers/[tenantId]/qr` | **Read-only fallback + active JSON write** | Prisma-first; legacy JSON QR rotate |
| `db.js` `normalizeDb()` auto `anchor_pool` seed | **Still active write** | On load, injects pool rows for JSON docs missing pool |

### 3.2 Document list / count

| Path | Classification | Notes |
|------|----------------|-------|
| `GET /api/issuer/documents` | **Already migrated + merged read** | `listMergedIssuerDocumentRecords` (Prisma + JSON deduped) |
| `loadIssuerDashboard` document metrics | **Already migrated + merged read** | Same merged list |
| `countPlatformDocumentRecords` | **Merged read** | Prisma count + JSON-only-by-id |
| `countPlatformAnchorPool` | **Merged read** | Prisma pool + JSON pool deduped by `documentId` |

### 3.3 Verification

| Path | Classification | Notes |
|------|----------------|-------|
| `GET /api/verify/[token]` | **Already migrated + read-only fallback** | `verifyPublicDocumentByToken` |
| `GET/POST /api/issuers/[tenantId]/verify` | **Already migrated + read-only fallback** | `verifyTenantDocumentRecord` |
| Tenant verify `verification_tokens` lookup | **Read-only fallback** | JSON token expiry row for legacy records |
| Public / tenant Merkle context | **Prisma-first + JSON fallback** | `findPrismaMerkleContext` / `findJsonMerkleContext` |

### 3.4 Hash / QR lookup (issuer API)

| Path | Classification | Notes |
|------|----------------|-------|
| `findDocumentRecordByHash` | **Prisma-first + read-only fallback** | No dedicated public route; used by services |
| `findDocumentRecordByVerificationToken` | **Prisma-first + read-only fallback** | Covers verification + QR tokens |
| `findPublicDocumentRecordByToken` | **Prisma-first + read-only fallback** | Public verify |

### 3.5 Revoke

| Path | Classification | Notes |
|------|----------------|-------|
| `revokeDocumentRecord` Prisma path | **Already migrated** | `auditEvent` + Prisma `apiLog` |
| `revokeDocumentRecord` JSON path | **Active JSON write** | `audit_logs` + `api_logs` + `saveDb` |

### 3.6 Anchoring batch

| Path | Classification | Notes |
|------|----------------|-------|
| `createPrismaMerkleBatch` / `publishPrismaMerkleBatch` | **Already migrated** | Primary queue |
| `createMerkleBatch` / `publishMerkleBatch` (JSON) | **Active JSON write** | Fair-queue alternate when Prisma pending exists |
| `POST /api/admin/anchoring/batches` | **Dual write orchestrator** | `withDb` + fair `resolveFairBatchSource` |
| `getAdminAnchoringSummary` | **Merged read** | Prisma + JSON batches/pool |
| `verifyMerkleBatchProofs` / retry | **Prisma-first + JSON fallback** | |

### 3.7 API logs

| Path | Classification | Notes |
|------|----------------|-------|
| Document create (Prisma) | **Already migrated** | `prisma.apiLog.create` in transaction |
| Hash / revoke / QR (Prisma record) | **Already migrated** | Prisma `apiLog` |
| Hash / revoke / QR (legacy record) | **Active JSON write** | `db.api_logs.push` + `saveDb` |
| `POST /api/issuers/[tenantId]/verify` audit | **Active JSON write** | Comment: "API audit log remains JSON-backed" |
| Admin `verificationsToday` | **JSON read only** | `db.api_logs` filter — **not** merged with Prisma `ApiLog` |
| Issuer dashboard `verificationScans` | **JSON read only** | `verification_tokens` + `api_logs` — **not** Prisma |

### 3.8 Admin dashboard counts

| Metric | Classification | Notes |
|--------|----------------|-------|
| `documentsIssued`, `anchoredDocuments` | **Merged read** | `countPlatformDocumentRecords` |
| `pendingAnchors`, `batchedAnchors`, `failedAnchors` (pool portion) | **Merged read** | `countPlatformAnchorPool` |
| `publishedBatches`, `anchorPending`, `failedAnchors` (batch portion) | **JSON read only** | `db.merkle_batches` — **gap**: not merged with Prisma batches |
| `totalIssuers`, `activeTenants` | **JSON read only** | Separate issuer-registry track |
| `verificationsToday` | **JSON read only** | See §3.7 |

### 3.9 Issuer dashboard counts

| Metric | Classification | Notes |
|--------|----------------|-------|
| Document list / summary | **Merged read** | Prisma + legacy JSON deduped |
| `verificationScans` | **JSON read only** | Must migrate to Prisma `ApiLog` + `VerificationToken` before R3 |
| `registryActivity` (audit + verify) | **JSON read only** | `audit_logs` + `api_logs` |

### 3.10 Summary legend

| Label | Meaning |
|-------|---------|
| **Already migrated** | Prisma-only for new records |
| **Read-only fallback** | JSON read when Prisma miss; `console.warn` in several paths |
| **Active JSON write** | Still mutates `db.json` via `saveDb` / `withDb` |
| **Merged read** | Prisma + JSON combined with id deduplication |
| **Safe to delete later** | Code path removable after R2 backfill + R3 soak |
| **Must keep temporarily** | Required until R2 completes or dependent system unmigrated |

---

## 4. File inventory

### 4.1 Core persistence

| File | JSON touchpoints |
|------|------------------|
| `data/db.json` | Live dev/staging file; production backup target |
| `src/lib/db.js` | `loadDb`, `saveDb`, `withDb`; `normalizeDb` auto-seeds `anchor_pool` |
| `src/lib/schema.js` | JSON schema reference for `document_records`, `verification_tokens`, `api_logs`, `audit_logs` |

### 4.2 Document records service

| File | Role |
|------|------|
| `src/lib/document-records.js` | Prisma CRUD + JSON fallback read/write for verify, hash, revoke, QR, merged list, platform counts |

### 4.3 Anchoring

| File | Role |
|------|------|
| `src/lib/anchoring/batchService.js` | Prisma batch + JSON batch; fair queue; merged admin summary |
| `src/lib/anchoring/merkle.js` | Pure functions (no JSON) |
| `src/lib/anchoring/publishers.js` | Publish adapters (no JSON) |

### 4.4 API routes (document/anchoring)

| File | JSON usage |
|------|------------|
| `src/app/api/issuers/[tenantId]/documents/route.js` | Prisma only (no direct JSON) |
| `src/app/api/issuers/[tenantId]/hashes/route.js` | Via `document-records` (legacy write) |
| `src/app/api/issuers/[tenantId]/revoke/route.js` | Via `document-records` (legacy write) |
| `src/app/api/issuers/[tenantId]/qr/route.js` | Via `document-records` (legacy write) |
| `src/app/api/issuers/[tenantId]/verify/route.js` | Read Prisma-first; **writes** `api_logs` to JSON on POST |
| `src/app/api/verify/[token]/route.ts` | Prisma-first via `document-records` (no JSON write) |
| `src/app/api/admin/anchoring/route.js` | `loadDb` for merged summary |
| `src/app/api/admin/anchoring/batches/route.js` | `withDb` — JSON batch path still writes |
| `src/app/api/admin/anchoring/batches/[id]/retry/route.js` | `loadDb` for JSON batch retry |
| `src/app/api/admin/anchoring/batches/[id]/verify/route.js` | `loadDb` for JSON batch verify |

### 4.5 Dashboards / UI

| File | JSON usage |
|------|------------|
| `src/app/admin/page.js` | `loadDb`; merged doc counts; **JSON-only** batch/verify metrics |
| `src/lib/issuer-dashboard.js` | Merged doc list; **JSON-only** activity + verification scans |
| `src/components/AdminAnchoringPanel.js` | Consumes API only (no direct JSON) |

### 4.6 Tests (fixtures, not production)

| File | Role |
|------|------|
| `test/anchoring.integration.test.mjs` | JSON fixture batch/verify |
| `test/anchoring-prisma.integration.test.mjs` | Prisma batch + JSON legacy read |
| `test/anchoring-phase53a.integration.test.mjs` | Fair queue, retry, failure |
| `test/document-records-phase52.integration.test.mjs` | JSON helper unit fixtures |
| `test/document-records.integration.test.mjs` | Prisma issuance |

### 4.7 Adjacent JSON consumers (not document-primary, keep for §8)

| File | JSON tables |
|------|-------------|
| `src/lib/auth.js` | `issuer_api_keys`, `issuer_api_clients` |
| `src/app/api/issuers/register/route.js` | `issuers`, `audit_logs` |
| `src/app/api/issuers/[tenantId]/api-clients/route.js` | `issuer_api_clients`, `issuer_api_keys` |
| `src/app/api/issuers/[tenantId]/webhooks/route.js` | `webhooks` |
| `src/lib/issuer-registry.js` | `issuers` |
| `src/lib/issuer-profile.js` | `issuers` (read/write) |
| `src/lib/document-request-lookup.js` | `issuers` (branding fallback) |
| `src/app/api/admin/issuers/route.js` | `issuers` |

---

## 5. Phased cutover

### Phase R1 — Disable new JSON writes (Prisma-only writes)

**Objective:** No new mutations to `document_records`, `anchor_pool`, `merkle_batches`, `merkle_proofs`, or document-related `verification_tokens` in `db.json`.

**Implementation (future):**

1. Add env flag `DOCUMENT_JSON_WRITES=0` (default off in production).
2. Guard all `saveDb` paths in `document-records.js` legacy branches → return 410 or transparent Prisma upsert if backfill incomplete.
3. Disable JSON branch in `batchService.createMerkleBatch` / `publishMerkleBatch` when flag off; Prisma-only fair queue becomes single queue.
4. Disable `normalizeDb()` auto `anchor_pool` injection for JSON `document_records`.
5. Migrate `POST /api/issuers/[tenantId]/verify` audit to `prisma.apiLog.create` (stop JSON write).
6. Log structured warning when legacy record encountered after R1 date.

**Preconditions:**

- All issuance paths confirmed Prisma-only (5.0–5.1A ✅).
- Production `prisma migrate deploy` current through `20260614120000_merkle_batch_error_message`.

**Soak:** 1 release minimum with flag on in staging; monitor for legacy-write attempts.

---

### Phase R2 — Backfill legacy JSON → Prisma

**Objective:** Every JSON document/anchoring row needed for verification exists in Prisma with **stable ids**.

**Backfill script (future):** `scripts/backfill-json-documents-to-prisma.mjs`

| JSON source | Prisma target | Rules |
|-------------|---------------|-------|
| `document_records[]` | `DocumentRecord` | Preserve `id`; map snake_case fields; skip if Prisma id exists |
| `verification_tokens[]` | `VerificationToken` | Link `documentRecordId`; skip duplicates by `token` |
| `anchor_pool[]` | `AnchorPool` | Preserve `id`; map `document_id` → `documentId` |
| `merkle_batches[]` | `MerkleBatch` | Preserve `id`; include `error_message` if present |
| `merkle_proofs[]` | `MerkleProof` | Preserve `id`; `proof_path` as JSON |

**Ordering:** documents → verification tokens → anchor pool → batches → proofs (FK order).

**Idempotency:** Upsert by primary key; dry-run mode prints would-insert / would-skip / conflicts.

**Not backfilled (archive only):** `api_logs`, `audit_logs` JSON rows — migrate reads to Prisma in R1/R3 instead; optional historical import to `ApiLog`/`AuditLog` if audit continuity required.

**Post-backfill validation:**

- Count parity: JSON unique ids vs Prisma rows (per tenant).
- Spot-check: verification token, QR token, hash, revoke status, anchor status.
- Merkle proof validity: `verifyMerkleBatchProofs` for each backfilled batch id.

---

### Phase R3 — Remove JSON fallback reads

**Objective:** All document/anchoring **reads** go to Prisma only.

**Implementation (future):**

1. Add `DOCUMENT_JSON_READS=0` flag.
2. Remove `loadDb` calls from:
   - `document-records.js` fallback branches
   - `batchService.js` JSON batch/list/verify paths
   - `admin/page.js` batch metrics → use `getAdminAnchoringSummary` Prisma-only variant
   - `issuer-dashboard.js` → Prisma `ApiLog`, `AuditLog`, `VerificationToken` for activity counts
3. `listMergedIssuerDocumentRecords` → `listIssuerDocumentRecords` (drop merge).
4. `countPlatformDocumentRecords` / `countPlatformAnchorPool` → Prisma-only counts.
5. Keep `data/db.json` on disk **read-only archived** (no code paths) for 1+ release.

**Preconditions:**

- R2 backfill complete; zero production verify failures for backfilled tokens.
- Dashboard count parity verified (§7 checklist).

---

### Phase R4 — Delete JSON persistence code

**Objective:** Remove dead code paths; shrink operational surface.

**Deletes (future):**

- JSON branches in `document-records.js`, `batchService.js`
- `findJson*` helpers exported for tests → move to test fixtures only
- `withDb` usage in anchoring routes (replace with Prisma-only handlers)
- `DATABASE_SCHEMA` entries for document/anchoring tables (or entire `schema.js` if fully retired)
- `normalizeDb` document/anchoring normalization blocks in `db.js`

**Optional:** Strip document/anchoring arrays from `data/db.json`; retain file for issuer API keys until §8 track completes.

**Documentation:** Update `docs/PHASE_5_ISSUANCE_INTEGRATION_PLAN.md`, `README.md` dev setup.

---

## 6. Rollback plan

| Trigger | Action |
|---------|--------|
| Verify failures spike after R1 | Re-enable `DOCUMENT_JSON_WRITES=1`; legacy records still in JSON |
| Backfill data corruption suspected | Stop R2; restore Postgres from pre-R2 backup; keep JSON authoritative |
| Dashboard count drift after R3 | Re-enable `DOCUMENT_JSON_READS=1`; investigate merge logic |
| Critical production outage | Redeploy previous release; flags default to dual-mode |

**Rules:**

- Never delete `db.json` backup until R4 soak complete (minimum 30 days post-R3).
- Never delete Prisma rows on rollback — JSON and Prisma can coexist; reads flag controls source.
- Backfill script must be re-runnable (idempotent) before production execution.

---

## 7. Testing plan

### 7.1 Automated (existing + future)

| Suite | Covers |
|-------|--------|
| `test/document-records.integration.test.mjs` | Prisma issuance |
| `test/document-records-phase52.integration.test.mjs` | Verify, hash, revoke, merge |
| `test/anchoring-prisma.integration.test.mjs` | Prisma batch + verify |
| `test/anchoring-phase53a.integration.test.mjs` | Fair queue, retry, failure |
| `test/anchoring.integration.test.mjs` | JSON batch (retire in R4) |

**Future tests:**

- `test/backfill-json-documents.integration.test.mjs` — fixture JSON → Prisma parity
- `test/document-json-reads-disabled.integration.test.mjs` — flags R1/R3 behavior
- Dashboard count tests with only Prisma seed data

### 7.2 Manual / staging smoke (per phase)

| Check | R1 | R2 | R3 | R4 |
|-------|----|----|----|-----|
| Issue document via API | ✓ | ✓ | ✓ | ✓ |
| Issue via request workflow | ✓ | ✓ | ✓ | ✓ |
| Public verify by token | ✓ | ✓ | ✓ | ✓ |
| Tenant verify by QR | ✓ | ✓ | ✓ | ✓ |
| Hash submit | ✓ | ✓ | ✓ | ✓ |
| Revoke | ✓ | ✓ | ✓ | ✓ |
| Admin anchor batch | ✓ | ✓ | ✓ | ✓ |
| Retry failed batch | ✓ | ✓ | ✓ | ✓ |
| Legacy token (pre-backfill) | ✓ | ✓ | N/A | N/A |

### 7.3 Backfill dry-run acceptance

- Zero id collisions with existing Prisma rows (or documented merges).
- 100% of published JSON documents have `MerkleProof` + `MerkleBatch` in Prisma when present in JSON.
- Revoked JSON documents → `DocumentRecord.status = 'revoked'`.
- No plaintext document content in backfilled rows (hash + metadata only).

---

## 8. Production deployment checklist

Execute in order; do not skip backups.

### Pre-deploy

- [ ] `prisma migrate deploy` — includes `DocumentRecord` owner fields, `IssuedDocument`, `MerkleBatch.errorMessage`
- [ ] Backup PostgreSQL (full dump + point-in-time if available)
- [ ] Backup `data/db.json` to versioned object storage (`db.json.YYYYMMDD.pre-r2.json`)
- [ ] Record baseline counts (script or SQL):
  - Prisma: `DocumentRecord`, `AnchorPool`, `MerkleBatch`, `MerkleProof`
  - JSON: `document_records`, `anchor_pool`, `merkle_batches`, `merkle_proofs`
- [ ] Announce maintenance window if R2 backfill is large

### R2 backfill execution

- [ ] Run `node scripts/backfill-json-documents-to-prisma.mjs --dry-run`
- [ ] Review dry-run report (insert/skip/conflict counts)
- [ ] Run backfill live with `--execute`
- [ ] Re-run dry-run — expect 100% skip

### Post-backfill verification

- [ ] **Counts:** Prisma document total ≥ JSON unique ids; no duplicate id inflation in dashboards
- [ ] **QR tokens:** Sample 10 legacy `qr_token` values → `GET /api/verify/[token]` returns 200
- [ ] **Verification tokens:** Sample 10 `verification_token` → tenant verify 200
- [ ] **Hashes:** `findDocumentRecordByHash` resolves backfilled records
- [ ] **Revoked:** Revoked JSON ids return `document_status: revoked` on public verify
- [ ] **Anchoring:** Backfilled published batches → `merkleProofValid: true` on tenant verify
- [ ] **Public verification:** Redacted fields only (`external_id`, `recipient_name` = `[redacted]`)
- [ ] Admin anchoring dashboard: pending/batched/anchored/failed match expectations
- [ ] `npm test` + `npm run build` on release tag

### R1 / R3 flag rollout

- [ ] Staging: `DOCUMENT_JSON_WRITES=0` → confirm no `db.json` mtime changes on document ops
- [ ] Staging: `DOCUMENT_JSON_READS=0` → confirm legacy tokens still resolve via Prisma
- [ ] Production: enable R1 → soak 7 days → enable R3 → soak 30 days → R4 code removal

---

## 9. Risk list

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Duplicate ids** if JSON and Prisma both have same doc with different hash | High | Backfill skip-if-exists; manual conflict report; never auto-overwrite Prisma |
| **QR / verify token uniqueness** on upsert | High | Unique constraints on `verificationToken`, `qrToken`; backfill preserves originals |
| **Merkle proof mismatch** after backfill | High | Validate proofs in dry-run; recompute leaf hashes from stored hash + doc id |
| **Published doc re-anchored** | Medium | `isPrismaDocumentEligibleForBatching` ✅; extend to backfill status checks |
| **API key auth still JSON** (`auth.js`) | Medium | Out of scope; issuer API works independent of document retirement |
| **Admin batch metrics JSON-only gap** | Medium | Fix in R3 prep: merge Prisma `MerkleBatch` in `admin/page.js` |
| **Verification analytics JSON-only** | Low | Migrate issuer dashboard to Prisma logs in R3 prep |
| **`normalizeDb` side effects** on every load | Medium | Disable in R1; causes silent JSON writes in dev |
| **Multi-instance fair-queue cursor** | Low | Irrelevant after R1 JSON batch disabled |
| **Rollback confusion** dual stores | Medium | Feature flags + runbook; keep JSON backup |

---

## 10. Acceptance criteria

### R1 complete when

- [ ] No integration test expects new JSON `document_records` rows in production mode
- [ ] `db.json` `mtime` unchanged after document create, hash, revoke, QR, anchor batch
- [ ] All new `api_logs` for document ops written to Prisma `ApiLog`

### R2 complete when

- [ ] 100% of production-relevant JSON `document_records` exist in Prisma (by id)
- [ ] All published JSON documents have consistent anchor/proof chain in Prisma
- [ ] Dry-run reports zero pending inserts
- [ ] Public verify succeeds for random sample of pre-migration tokens

### R3 complete when

- [ ] `DOCUMENT_JSON_READS=0` in production for 30 days without verify regression
- [ ] Dashboard document + anchor counts match Prisma SQL counts
- [ ] No `loadDb()` in document/anchoring hot paths (grep gate in CI)

### R4 complete when

- [ ] JSON document/anchoring code removed; `npm test` green
- [ ] `data/db.json` document arrays empty or file removed from deploy artifact
- [ ] Docs updated; operators have archived JSON backup location

---

## 11. Parallel track — remaining `db.json` (post document retirement)

These tables are **not** covered by R1–R4 but block full `db.json` file deletion:

| JSON table | Prisma model exists? | Migration priority |
|------------|---------------------|------------------|
| `issuer_api_keys` / `issuer_api_clients` | Yes (`IssuerApiKey`, `IssuerApiClient`) | **High** — blocks `auth.js` retirement |
| `issuers` / `tenants` | Yes (`Issuer`, `Tenant`) | Medium — admin/issuer registry |
| `webhooks` | Yes (`Webhook`) | Medium |
| `document_templates` / `document_types` | Yes (Prisma templates) | Low — mostly Prisma already in portal |
| `api_logs` / `audit_logs` (historical) | Yes | Low — import optional for analytics |

Recommend **Issuer API auth migration** as Phase R5 before deleting `src/lib/db.js` entirely.

---

## 12. Recommended timeline

| Week | Phase | Activity |
|------|-------|----------|
| 1 | R1 prep | Verify POST audit → Prisma; admin batch count merge; feature flags |
| 2 | R1 deploy | Staging + production; monitor |
| 3 | R2 | Backfill script; dry-run; production execute |
| 4 | R3 prep | Issuer dashboard Prisma activity; remove merge helpers |
| 5–6 | R3 deploy | Read flag on; soak |
| 7+ | R4 | Code deletion; archive `db.json` |

---

## 13. Approval gates

| Gate | Approver focus |
|------|----------------|
| R1 | No accidental legacy customer still issuing to JSON-only path |
| R2 | Backfill dry-run sign-off; id conflict resolution |
| R3 | Verify/QR/hash/revoke smoke on production sample set |
| R4 | 30-day soak + backup retention confirmed |

**Do not implement until this plan is approved.**
