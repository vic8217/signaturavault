# Zero Trust Level 2 Gap Analysis

Audit date: 2026-06-09

## Severity Summary

| Severity | Count | Theme |
| --- | ---: | --- |
| CRITICAL | 0 | No active provider private-field plaintext endpoint, master plaintext key, or plaintext fallback return path was found in audited routes. |
| HIGH | 0 | No unresolved blocker remains in the active Zero Trust Level 2 route surface. |
| MEDIUM | 1 | Legacy internal persistence names remain. |
| LOW | 1 | Additional admin/export redaction tests should be added. |

## Current Security Model

Signatura uses Zero Trust Level 2:

- Authentication is required.
- Access is constrained by role and tenant.
- Sensitive private fields are encrypted before database storage.
- Important reads, writes, authorization decisions, and verification events are logged.
- Admin/provider routes do not receive a private-field decrypt path.

## Removed From Active Surface

- Security terminology stronger than Zero Trust Level 2.
- Public compatibility routes outside `/api/zero-trust/*`.
- Placeholder service contracts that were not wired to active routes.

## Remaining Risks

- The Prisma persistence layer still has legacy model/table names for key-reference records. Rename these in a dedicated migration when data movement can be planned safely.
- Legacy plaintext-capable schema fields still exist for issuer and document workflows and should continue moving to encrypted envelopes plus keyed lookup hashes.
- Admin/support export and search surfaces need more tests proving plaintext private/contact fields are not returned.

## Recommended Next Tests

- Admin and support API redaction tests.
- Session payload tests proving email/name are absent.
- Schema tests proving private fields are encrypted envelopes or keyed hashes.
- Recovery tests proving Signatura ID plus recovery code plus passkey re-enrollment works without admin-visible contact data.
