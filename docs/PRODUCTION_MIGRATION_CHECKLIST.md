# Production Migration Checklist — JSON Retirement (R1 / R2)

**Status:** Operational checklist — **no application code in this document**  
**Prerequisite plan:** [`JSON_RETIREMENT_PLAN.md`](./JSON_RETIREMENT_PLAN.md)  
**Goal:** Safely execute R1 (disable JSON writes) and R2 (backfill JSON → Prisma) without breaking document verification.

**Assumptions:**

- Commands run from repository root: `/home/victor/TigerDeveloper/signaturavaultv1` (adjust `cd` as needed).
- `DATABASE_URL` is set (from `.env` or environment).
- Backfill script is **planned** as `scripts/backfill-json-documents-to-prisma.mjs` (not shipped yet). Commands below use that path per the retirement plan; substitute the actual script name once implemented.

---

## Quick reference — deployment order

| Order | Environment | Phase | Gate before next step |
|-------|-------------|-------|------------------------|
| 1 | **Dev** | Migrate + baseline + dry-run | Counts + sample verify pass locally |
| 2 | **Staging** | R1 flag on → soak 3–7 days | No `db.json` writes; verify smoke green |
| 3 | **Staging** | R2 backfill execute | Dry-run 100% skip; sample verify pass |
| 4 | **Production** | `prisma migrate deploy` + backups | Backups verified restorable |
| 5 | **Production** | R1 deploy | 7-day soak; monitoring clean |
| 6 | **Production** | R2 backfill | Post-backfill checklist §10 complete |

Do **not** run R2 production backfill until staging R2 succeeds. Do **not** enable R3 (`DOCUMENT_JSON_READS=0`) in this checklist — that is a later phase.

---

## 1. Required environment variables

### 1.1 Core (required for app + Prisma)

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | **Yes** | PostgreSQL connection for Prisma |
| `SESSION_SECRET` | **Yes** | Session signing (or `AUTH_SECRET` fallback in code) |
| `RECOVERY_CODE_SECRET` | **Yes** | Recovery code hashing |
| `ACTIVATION_TOKEN_SECRET` | **Yes** | Issuer invitation tokens |
| `NODE_ENV` | **Yes** | `production` on staging/prod |

**Verify loaded:**

```bash
cd /home/victor/TigerDeveloper/signaturavaultv1
set -a && source .env && set +a
test -n "$DATABASE_URL" && echo "DATABASE_URL: OK" || echo "DATABASE_URL: MISSING"
test -n "$SESSION_SECRET" && echo "SESSION_SECRET: OK" || echo "SESSION_SECRET: MISSING"
```

### 1.2 Anchoring (required for batch publish)

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `ANCHOR_PUBLISH_METHOD` | Recommended | `audit_anchor` | Batch publish adapter |
| `ANCHOR_BATCH_SIZE` | Optional | `100` | Max docs per batch |

**Production rule:** `ANCHOR_PUBLISH_METHOD` must **not** be `mock` (enforced in code).

**Optional (only if using on-chain publisher — not default for R1/R2):**

- `ANCHOR_RPC_URL`, `ANCHOR_PRIVATE_KEY`, `ANCHOR_CHAIN`, `ANCHOR_TO_ADDRESS`, `ANCHOR_CONFIRMATIONS`

### 1.3 Migration flags (planned — enable when R1/R2 code ships)

| Variable | Phase | Value | Purpose |
|----------|-------|-------|---------|
| `DOCUMENT_JSON_WRITES` | R1 | `0` | Disable JSON document/anchoring writes |
| `DOCUMENT_JSON_READS` | R3 | `0` | Disable JSON fallback reads (not R1/R2) |

Until flags exist in code, treat R1 as “verify no `saveDb` side effects” via §11 mtime/checksum checks.

### 1.2 Pre-flight checklist

- [ ] `DATABASE_URL` points to correct environment database (not dev URL on prod).
- [ ] Secrets are unique per environment (not copied from `.env.example`).
- [ ] `ANCHOR_PUBLISH_METHOD=audit_anchor` on staging and production.
- [ ] `.env` is **not** committed to git.
- [ ] Reverse proxy upload body limit supports issuer template uploads. For nginx, set `client_max_body_size 50m;` on the Signatura server/location block, then reload nginx. A 1.4 MB upload returning HTTP 413 usually means nginx is still using its 1 MB default.
- [ ] Application health check passes: `curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000/` (or deployment URL).

---

## 2. Prisma migration status

### 2.1 Document / anchoring migrations (must be applied before R2)

| Migration | Purpose |
|-----------|---------|
| `20260521000000_merkle_batch_anchoring` | `AnchorPool`, `MerkleBatch`, `MerkleProof`, document anchor fields |
| `20260612120000_document_record_owner_fields` | `ownerUserId`, `documentRequestId`, `documentTypeLabel` |
| `20260613120000_issued_documents` | `IssuedDocument` linkage |
| `20260614120000_merkle_batch_error_message` | `MerkleBatch.errorMessage` |

### 2.2 Commands

```bash
cd /home/victor/TigerDeveloper/signaturavaultv1
set -a && source .env && set +a

# Show pending vs applied migrations
npx prisma migrate status

# Apply pending migrations (staging/production — not dev reset)
npx prisma migrate deploy

# Confirm Prisma client matches schema
npx prisma generate

# Optional: open DB browser
# npm run db:studio
```

### 2.3 Checklist

- [ ] `npx prisma migrate status` reports **“Database schema is up to date”**.
- [ ] No failed migrations in `_prisma_migrations` table.
- [ ] `npx prisma generate` completes without error on deploy host.
- [ ] Tables exist:

```bash
psql "$DATABASE_URL" -c "\dt" | grep -E 'document_records|anchor_pool|merkle_batches|merkle_proofs|verification_tokens'
```

---

## 3. PostgreSQL backup command

Run **before** R2 backfill on staging and production. Store off-host.

### 3.1 Custom format (recommended — supports selective restore)

```bash
cd /home/victor/TigerDeveloper/signaturavaultv1
set -a && source .env && set +a

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$BACKUP_DIR/signatura-pre-r2-${STAMP}.dump"

ls -lh "$BACKUP_DIR/signatura-pre-r2-${STAMP}.dump"
```

### 3.2 Plain SQL (human-readable)

```bash
pg_dump "$DATABASE_URL" \
  --format=plain \
  --no-owner \
  --no-acl \
  --file="$BACKUP_DIR/signatura-pre-r2-${STAMP}.sql"
```

### 3.3 Verify backup is readable

```bash
pg_restore --list "$BACKUP_DIR/signatura-pre-r2-${STAMP}.dump" | head -20
```

### 3.4 Checklist

- [ ] Backup file created and non-zero size.
- [ ] Backup copied to durable storage (S3, GCS, etc.).
- [ ] Restore drill performed on staging at least once per quarter.
- [ ] Backup timestamp recorded in change ticket.

---

## 4. `db.json` backup command

JSON remains the rollback source for legacy verification until R3 soak completes.

```bash
cd /home/victor/TigerDeveloper/signaturavaultv1

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SRC="data/db.json"
DEST="$BACKUP_DIR/db.json.pre-r2.${STAMP}.json"

cp -a "$SRC" "$DEST"
sha256sum "$SRC" "$DEST" | tee "$BACKUP_DIR/db.json.pre-r2.${STAMP}.sha256"

# Optional: validate JSON
jq empty "$DEST" && echo "JSON valid"
```

### Checklist

- [ ] `data/db.json` exists (or document empty arrays if greenfield).
- [ ] Backup checksum saved.
- [ ] Backup stored alongside Postgres dump.
- [ ] Do **not** edit backup files in place.

---

## 5. Backfill dry-run command

**Planned script** (per `JSON_RETIREMENT_PLAN.md` §5 R2). Run only after it is implemented and reviewed.

```bash
cd /home/victor/TigerDeveloper/signaturavaultv1
set -a && source .env && set +a

# Dry-run: no writes
node scripts/backfill-json-documents-to-prisma.mjs \
  --source data/db.json \
  --dry-run \
  --report ./backups/backfill-dry-run-$(date -u +%Y%m%d).json

# Live execute (staging first, then production)
node scripts/backfill-json-documents-to-prisma.mjs \
  --source data/db.json \
  --execute \
  --report ./backups/backfill-execute-$(date -u +%Y%m%d).json

# Confirm idempotency: second dry-run should show 100% skip
node scripts/backfill-json-documents-to-prisma.mjs \
  --source data/db.json \
  --dry-run
```

### Dry-run acceptance (review report)

- [ ] `would_insert` + `would_skip` + `conflicts` totals match JSON row counts.
- [ ] **Zero** unresolved `conflicts` (or each conflict documented and approved).
- [ ] No plaintext document payloads in mapped fields (hash + metadata only).
- [ ] Order respected: documents → verification_tokens → anchor_pool → merkle_batches → merkle_proofs.

---

## 6. Compare JSON vs Prisma counts

Run **before and after** R2. Save output in the change ticket.

### 6.1 JSON counts (`jq`)

```bash
cd /home/victor/TigerDeveloper/signaturavaultv1
DB_JSON="data/db.json"

echo "=== JSON counts ==="
jq '{
  document_records_unique: ([.document_records[].id] | unique | length),
  document_records_total: (.document_records | length),
  verification_tokens: (.verification_tokens | length),
  anchor_pool: (.anchor_pool | length),
  merkle_batches: (.merkle_batches | length),
  merkle_proofs: (.merkle_proofs | length),
  revoked_documents: ([.document_records[] | select(.status == "revoked")] | length),
  published_anchor: ([.document_records[] | select(.anchor_status == "published")] | length)
}' "$DB_JSON"
```

### 6.2 Prisma counts (`psql`)

```bash
set -a && source .env && set +a

psql "$DATABASE_URL" <<'SQL'
SELECT 'document_records' AS entity, COUNT(*)::int AS count FROM document_records
UNION ALL SELECT 'verification_tokens', COUNT(*)::int FROM verification_tokens
UNION ALL SELECT 'anchor_pool', COUNT(*)::int FROM anchor_pool
UNION ALL SELECT 'merkle_batches', COUNT(*)::int FROM merkle_batches
UNION ALL SELECT 'merkle_proofs', COUNT(*)::int FROM merkle_proofs
UNION ALL SELECT 'revoked_documents', COUNT(*)::int FROM document_records WHERE status = 'revoked'
UNION ALL SELECT 'published_anchor', COUNT(*)::int FROM document_records WHERE anchor_status = 'published'
ORDER BY entity;
SQL
```

### 6.3 JSON ids **not** yet in Prisma (pre-R2 gap)

```bash
set -a && source .env && set +a

jq -r '.document_records[].id' data/db.json | sort -u > /tmp/json-doc-ids.txt

psql "$DATABASE_URL" -t -A -c 'SELECT id FROM document_records ORDER BY id' > /tmp/prisma-doc-ids.txt

echo "JSON-only document ids (should be 0 after successful R2):"
comm -23 /tmp/json-doc-ids.txt /tmp/prisma-doc-ids.txt | head -20
echo "JSON-only count: $(comm -23 /tmp/json-doc-ids.txt /tmp/prisma-doc-ids.txt | wc -l)"
```

### 6.4 Expected parity rules

| Metric | After R2 expectation |
|--------|----------------------|
| Unique JSON `document_records.id` | ⊆ Prisma `document_records.id` (all legacy ids present) |
| Prisma total documents | ≥ JSON unique ids (may include new Prisma-only issuances) |
| `merkle_proofs` / `merkle_batches` | Prisma ≥ JSON for backfilled batches |
| Revoked count | Equal for shared ids |
| Dashboard merged count | Must not double-count same `id` (Prisma + JSON dedupe) |

### Checklist

- [ ] Baseline JSON + Prisma counts recorded pre-R2.
- [ ] Post-R2: JSON-only id count = **0** (or approved exceptions listed).
- [ ] Revoked and published counts reconciled for sample tenants.

---

## 7. Verify sample QR tokens

Public verification must return **redacted** metadata only.

### 7.1 Extract sample QR tokens from JSON

```bash
jq -r '.document_records[:10][] | select(.qr_token != null) | .qr_token' data/db.json
```

### 7.2 Extract sample QR tokens from Prisma

```bash
psql "$DATABASE_URL" -t -A -c \
  "SELECT qr_token FROM document_records ORDER BY created_at DESC LIMIT 10;"
```

### 7.3 Call public verify API

Replace `BASE_URL` and `TOKEN` per environment.

```bash
BASE_URL="${BASE_URL:-http://localhost:3000}"
TOKEN="<paste-qr-token>"

curl -sS "${BASE_URL}/api/verify/${TOKEN}" | jq '{
  http_check: "manual",
  token_valid: .token_valid,
  document_status: .document_status,
  anchor_status: .anchor_status,
  merkle_proof_available: .merkle_proof_available,
  external_id: .external_id,
  recipient_name: .recipient_name,
  private_data_redacted: .private_data_redacted
}'
```

### 7.4 Pass criteria (each sample)

- [ ] HTTP 200 for valid, non-expired tokens.
- [ ] `private_data_redacted: true`
- [ ] `external_id` and `recipient_name` are `[redacted]` (not plaintext PII).
- [ ] `document_status` matches source record (`valid` or `revoked`).
- [ ] Anchored docs: `merkle_proof_available: true` and `batch.status` = `published` when applicable.

---

## 8. Verify sample hashes

There is no public hash-only verify endpoint. Validate **hash integrity** via DB parity and tenant verify (hash match flag).

### 8.1 Compare hash fields JSON vs Prisma (shared ids)

```bash
set -a && source .env && set +a

jq -r '.document_records[] | [.id, (.document_hash // .hash)] | @tsv' data/db.json \
  | sort > /tmp/json-hash.tsv

psql "$DATABASE_URL" -t -A -F $'\t' -c \
  "SELECT id, COALESCE(document_hash, hash) FROM document_records ORDER BY id" \
  > /tmp/prisma-hash.tsv

echo "Hash mismatches for shared ids:"
join -t $'\t' /tmp/json-hash.tsv /tmp/prisma-hash.tsv | awk -F'\t' '$2 != $3 {print}' | head -20
```

### 8.2 Tenant verify — `documentHashMatch`

Requires issuer API key and tenant id.

```bash
BASE_URL="${BASE_URL:-http://localhost:3000}"
TENANT_ID="<tenant-id>"
API_KEY="<issuer-api-key>"
VERIFY_TOKEN="<verification_token>"

curl -sS -H "x-api-key: ${API_KEY}" \
  "${BASE_URL}/api/issuers/${TENANT_ID}/verify?token=${VERIFY_TOKEN}" \
  | jq '{ documentHashMatch, merkleProofValid, publicCommitmentValid, documentStatus, anchorStatus }'
```

### Checklist

- [ ] Zero hash mismatches on shared ids after R2.
- [ ] Sample of 10 records: `documentHashMatch: true` on tenant verify.
- [ ] Published records: `merkleProofValid: true` and `publicCommitmentValid: true` where batch is published.

---

## 9. Verify revoked records

### 9.1 List revoked ids from JSON

```bash
jq -r '.document_records[] | select(.status == "revoked") | .id' data/db.json | head -10
```

### 9.2 List revoked ids from Prisma

```bash
psql "$DATABASE_URL" -t -A -c \
  "SELECT id FROM document_records WHERE status = 'revoked' ORDER BY updated_at DESC LIMIT 10;"
```

### 9.3 Public verify must show revoked (not 404 if token still valid)

```bash
TOKEN="<verification_or_qr_token_for_revoked_doc>"
curl -sS "${BASE_URL}/api/verify/${TOKEN}" | jq '{ document_status, token_valid }'
```

### Checklist

- [ ] Every revoked JSON id has `status = 'revoked'` in Prisma after R2.
- [ ] Public verify returns `document_status: "revoked"` (not plaintext PII).
- [ ] Revoked docs must **not** return `document_status: "valid"`.

---

## 10. Rollback if Prisma verification fails

Use when post-R2 or post-R1 verify smoke fails and operators need to restore service quickly.

### 10.1 Immediate mitigation (no data restore)

1. **Redeploy previous application release** (dual-read/dual-write still intact).
2. If R1 flags deployed: set `DOCUMENT_JSON_WRITES=1` and `DOCUMENT_JSON_READS=1` (when available); restart app.
3. JSON `data/db.json` backup remains authoritative for legacy tokens — **do not delete**.

### 10.2 Restore PostgreSQL from pre-R2 backup

```bash
# DESTRUCTIVE — staging only unless production incident approved
set -a && source .env && set +a
BACKUP_FILE="./backups/signatura-pre-r2-YYYYMMDDTHHMMSSZ.dump"

# Drop and recreate public schema (adjust for your policy)
psql "$DATABASE_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'

pg_restore \
  --dbname="$DATABASE_URL" \
  --no-owner \
  --no-acl \
  --verbose \
  "$BACKUP_FILE"
```

### 10.3 Restore `db.json`

```bash
cp -a ./backups/db.json.pre-r2.YYYYMMDD.json data/db.json
jq empty data/db.json && echo "Restored db.json OK"
```

### 10.4 Rollback decision matrix

| Symptom | Likely action |
|---------|----------------|
| Prisma verify 404 for legacy token still in JSON | Pause R3; keep JSON reads; re-run R2 for missing ids |
| Hash mismatch after R2 | Stop R2; restore Postgres; fix backfill mapping |
| Duplicate Merkle proofs | Stop backfill; restore Postgres; fix idempotent script |
| Dashboard count inflation | Do not enable R3; use JSON+Prisma merge until fixed |

### Rollback checklist

- [ ] Incident owner assigned; change ticket updated.
- [ ] Postgres restore tested on staging before prod restore.
- [ ] `db.json` restore path verified.
- [ ] Sample verify (§7–9) re-run after rollback.
- [ ] Root cause documented before second R2 attempt.

---

## 11. Confirm no new JSON writes (R1 validation)

Use after R1 deploy or when simulating R1 on staging **before** production.

### 11.1 Checksum guard (run around a document operation window)

```bash
cd /home/victor/TigerDeveloper/signaturavaultv1
DB_JSON="data/db.json"

sha256sum "$DB_JSON" | tee /tmp/db.json.before.sha256

# --- Perform document operations (issue, hash, revoke, QR, anchor batch) ---

sha256sum "$DB_JSON" | tee /tmp/db.json.after.sha256
diff /tmp/db.json.before.sha256 /tmp/db.json.after.sha256 && echo "PASS: db.json unchanged"
```

### 11.2 mtime guard

```bash
MTIME_BEFORE=$(stat -c %Y data/db.json)
# --- document operations ---
MTIME_AFTER=$(stat -c %Y data/db.json)
test "$MTIME_BEFORE" = "$MTIME_AFTER" && echo "PASS: mtime unchanged" || echo "FAIL: db.json was written"
```

### 11.3 Monitor `withDb` / `saveDb` paths (code review gate)

Until R1 ships, these routes may still write JSON — track as blockers:

- `document-records.js` legacy hash / revoke / QR branches
- `batchService.js` JSON `createMerkleBatch`
- `api/issuers/[tenantId]/verify` POST → `api_logs`
- `db.js` `normalizeDb()` auto `anchor_pool` injection

### R1 validation checklist

- [ ] Checksum unchanged after: document create, hash submit, revoke, QR rotate, admin anchor batch.
- [ ] `DOCUMENT_JSON_WRITES=0` set on staging (when implemented).
- [ ] No new rows in JSON `document_records`, `anchor_pool`, `merkle_batches`, `merkle_proofs` during soak.

---

## 12. Deployment order — dev → staging → production

### Phase A — Dev (local or dev cluster)

- [ ] `npm test` and `npm run build` green on release branch.
- [ ] `npx prisma migrate deploy` on dev database.
- [ ] §6 baseline counts captured.
- [ ] Backfill `--dry-run` reviewed (when script exists).
- [ ] §7–9 sample verify on dev `BASE_URL`.

### Phase B — Staging

- [ ] Deploy application build to staging.
- [ ] `npx prisma migrate deploy` (staging `DATABASE_URL`).
- [ ] §3 Postgres backup + §4 `db.json` backup.
- [ ] Enable **R1** (`DOCUMENT_JSON_WRITES=0`) when available.
- [ ] §11 — confirm no JSON writes (3–7 day soak).
- [ ] R2 backfill `--execute` on staging.
- [ ] §6 post-R2 parity; §7–9 smoke; admin anchoring dashboard review.
- [ ] Rollback drill (§10) on staging.

### Phase C — Production

- [ ] Change window approved; on-call assigned.
- [ ] §3 + §4 backups completed and verified.
- [ ] `npx prisma migrate deploy` (production).
- [ ] Deploy production build (same artifact validated on staging).
- [ ] Confirm production reverse proxy allows template uploads (`client_max_body_size 50m;` or equivalent).
- [ ] Enable **R1**; §11 immediate check + 7-day soak.
- [ ] R2 backfill `--dry-run` → review → `--execute`.
- [ ] §6–9 post-backfill verification complete.
- [ ] Monitor: public verify error rate, 404 rate, admin batch failures.
- [ ] Document completion in runbook; keep backups 30+ days.

---

## 13. Master sign-off checklist (R1 + R2 complete)

| # | Item | Owner | Date | Pass |
|---|------|-------|------|------|
| 1 | Env vars verified (§1) | | | ☐ |
| 2 | `prisma migrate status` up to date (§2) | | | ☐ |
| 3 | Postgres backup restorable (§3) | | | ☐ |
| 4 | `db.json` backup checksum saved (§4) | | | ☐ |
| 5 | Backfill dry-run approved (§5) | | | ☐ |
| 6 | JSON vs Prisma counts reconciled (§6) | | | ☐ |
| 7 | QR token samples verified (§7) | | | ☐ |
| 8 | Hash parity / tenant verify (§8) | | | ☐ |
| 9 | Revoked records verified (§9) | | | ☐ |
| 10 | Rollback procedure understood (§10) | | | ☐ |
| 11 | No new JSON writes confirmed (§11) | | | ☐ |
| 12 | Dev → staging → prod order followed (§12) | | | ☐ |

---

## 14. Related documents

- [`JSON_RETIREMENT_PLAN.md`](./JSON_RETIREMENT_PLAN.md) — phased R1–R4 architecture and acceptance criteria
- [`PHASE_5_ISSUANCE_INTEGRATION_PLAN.md`](./PHASE_5_ISSUANCE_INTEGRATION_PLAN.md) — issuance migration context

**Do not modify application code as part of this checklist.** Implement R1/R2 flags, backfill script, and dashboard fixes in separate approved changes.
