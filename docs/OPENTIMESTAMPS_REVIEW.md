# OpenTimestamps Review

Audit date: 2026-06-10

## Summary

**Document authenticity does not depend on Bitcoin OpenTimestamps.**

A document is considered authentic when all of the following hold:

1. **SHA-256 document hash** — the presented document hash matches the hash stored on `document_records`
2. **Merkle proof** — the document hash is included in a valid Merkle proof against a published batch root
3. **Published anchor status** — the linked `merkle_batches` row has `status = published` (via audit anchor commitment, optional on-chain tx, or legacy OTS-published batch)

QR / verification-token lookup and audit logging (`api_logs`, `audit_logs`) provide the verification channel and traceability. Bitcoin OTS confirmation was never required for document authenticity; it only optionally stamped Merkle roots. That dependency has been removed from the active codebase.

## Code paths reviewed

### Create proofs

| Path | Classification | Notes |
| --- | --- | --- |
| `OpenTimestampsPublisher.publishMerkleRoot()` | **Obsolete** | Removed |
| `AuditAnchorPublisher.publishMerkleRoot()` | **Required** | Replaces mock/OTS for default anchoring |
| `MockPublisher.publishMerkleRoot()` | **Optional** | Alias of audit anchor publisher |
| `BlockchainPublisher.publishMerkleRoot()` | **Optional** | EVM on-chain publishing |

### Upgrade proofs

| Path | Classification | Notes |
| --- | --- | --- |
| `upgradeOpenTimestampsBatch()` | **Obsolete** | Removed |
| `upgradePendingOpenTimestampsBatches()` | **Obsolete** | Removed |
| `POST /api/admin/anchoring/opentimestamps/upgrade` | **Obsolete** | Route deleted |

### Verify proofs

| Path | Classification | Notes |
| --- | --- | --- |
| `verifyOpenTimestampsBatchProof()` | **Obsolete** | Removed |
| `verifyBatchPublicCommitment()` | **Required** | Merkle + audit anchor / chain tx / legacy OTS status |
| `verifyDocumentMerkleProof()` | **Required** | Core document verification |
| `GET /api/verify/[token]` | **Required** | QR/token verification, no OTS dependency |
| `GET /api/issuers/[tenantId]/verify` | **Required** | Issuer API verification |
| `POST /api/admin/anchoring/batches/[id]/verify` | **Required** | Admin batch verification |

### Display status

| Path | Classification | Notes |
| --- | --- | --- |
| `AdminAnchoringPanel` OTS buttons | **Obsolete** | Replaced with anchor batch controls |
| `IssuerDocumentSummary` OTS labels | **Obsolete** | Renamed to anchor status |
| `admin/page.js` OTS pending card | **Obsolete** | Renamed to anchor pending |
| `issuer/documents` OTS filters | **Obsolete** | Renamed to anchor status |

## Classification

### Required (retained)

- SHA-256 document hashing
- Merkle batching and proof verification
- QR / verification token endpoints
- Audit anchor commitments stored in `merkle_batches.timestamp_proof`
- API audit logging for verification checks

### Optional (retained)

- EVM / L2 chain publishing via `BlockchainPublisher`
- Legacy `mock` publish method alias

### Obsolete (removed)

- `opentimestamps` npm package
- `request` / `request-promise` transitive dependencies
- `OpenTimestampsPublisher`
- OTS upgrade admin workflow
- Bitcoin timestamp re-verification

## Existing document compatibility

- Documents with Merkle proofs remain verifiable through **SHA-256 hash + Merkle proof + published anchor status**.
- Legacy batches with `publish_method = opentimestamps` and `status = published` still pass Merkle verification (`test/anchoring.integration.test.mjs`). Bitcoin OTS re-verification is no longer performed.
- The database column `timestamp_proof` is **not renamed** in this change. It continues to store anchor commitment payloads (legacy OTS base64 proofs remain readable but are not re-verified).

## Replacement model

New batches use:

- `publish_method = audit_anchor`
- `timestamp_proof` = base64 JSON `audit_anchor_commitment`
- `chain = signatura_audit`
- `transaction_id` = deterministic anchor reference derived from batch id + merkle root
