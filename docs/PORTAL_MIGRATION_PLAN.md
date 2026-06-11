# Portal Architecture Migration — Implementation Plan

**Repository:** `signaturavaultv1`  
**Based on:** Architecture Separation Review + `docs/PORTAL_DEPENDENCY_REVIEW.md`  
**Plan type:** Implementation plan only (no code changes in this document)  
**Date:** 2026-06-10

---

## Scope Summary

| Workstream | Action |
|------------|--------|
| Issuer portal | Collapse `issuer-portal/*` into `issuer/*`; single layout |
| Owner portal | Merge `wallet/*` + `security/*` → `signatura/*` |
| Marketing | Rename `/document-owners` → `/users` |
| Components | Reorganize flat `src/components/` into 7 folders |
| Cross-cutting | RBAC, proxy, redirects, hardcoded route strings |

**API routes unchanged in this plan** (`/api/security/*`, `/api/issuer/*`, `/api/admin/*` stay as-is unless a later phase explicitly migrates them).

---

## Phase 1 — Foundation (Component Folders + Marketing Rename)

**Goal:** Establish portal boundaries in the component layer and fix marketing IA without touching authenticated portal routes.

**Risk:** Low  
**Deployable:** Yes — no breaking route changes if imports are updated atomically.

### 1.1 Create component folder structure

```
src/components/
├── marketing/
├── issuer/
├── signatura/
├── admin/
├── auth/
├── shared/
└── integrations/
```

### 1.2 Every component file that must move

| Current path | New path |
|--------------|----------|
| `Marketing.js` | `marketing/Marketing.js` |
| `HomeLoginModal.js` | `marketing/HomeLoginModal.js` |
| `LoginModal.js` | `marketing/LoginModal.js` |
| `IssuerDocumentSummary.js` | `issuer/IssuerDocumentSummary.js` |
| `IssuerProfileForm.js` | `issuer/IssuerProfileForm.js` |
| `IssuerInvitationForm.js` | `issuer/IssuerInvitationForm.js` |
| `IssuerActivationForm.js` | `issuer/IssuerActivationForm.js` |
| `IssuerTemplateIssuancePanel.js` | `issuer/IssuerTemplateIssuancePanel.js` |
| `TemplateCaptureDashboard.js` | `issuer/TemplateCaptureDashboard.js` *(later split to `shared/`)* |
| `WalletBottomNav.js` | `signatura/BottomNav.js` *(rename recommended)* |
| `WalletIssuerDirectory.js` | `signatura/IssuerDirectory.js` *(rename recommended)* |
| `WalletIssuerDocuments.js` | `signatura/IssuerDocuments.js` *(rename recommended)* |
| `RegisterTrustedDevicePrompt.js` | `signatura/RegisterTrustedDevicePrompt.js` |
| `DevicesPanel.js` | `signatura/DevicesPanel.js` |
| `AddPasskeyPanel.js` | `signatura/AddPasskeyPanel.js` |
| `RecoveryCodesPanel.js` | `signatura/RecoveryCodesPanel.js` |
| `SecurityNavLinks.js` | `signatura/SecurityNavLinks.js` |
| `AdminAnchoringPanel.js` | `admin/AdminAnchoringPanel.js` |
| `AdminDigitizationDashboard.js` | `admin/AdminDigitizationDashboard.js` |
| `RegisterIssuerModal.js` | `admin/RegisterIssuerModal.js` |
| `LoginPasskeyForm.js` | `auth/LoginPasskeyForm.js` |
| `LoginTrustedDeviceQrPanel.js` | `auth/LoginTrustedDeviceQrPanel.js` |
| `LoginRemoteApproveForm.js` | `auth/LoginRemoteApproveForm.js` |
| `RegisterPasskeyForm.js` | `auth/RegisterPasskeyForm.js` |
| `RecoveryCodeLoginForm.js` | `auth/RecoveryCodeLoginForm.js` |
| `PasskeyNotice.js` | `auth/PasskeyNotice.js` |
| `PortalIcon.js` | `shared/PortalIcon.js` |
| `ServiceWorkerRegister.js` | `shared/ServiceWorkerRegister.js` |
| `HoaKeySetupForm.js` | `integrations/HoaKeySetupForm.js` |
| `HoaKeyRemoteUnlockForm.js` | `integrations/HoaKeyRemoteUnlockForm.js` |
| `QrCodeScanner.js` | `integrations/QrCodeScanner.js` |

**Total component moves:** 31 files

### 1.3 Every import that must change (Phase 1)

#### App pages → new `@/components/{folder}/...` paths (42 import sites)

| File | Current import(s) | New import(s) |
|------|-------------------|---------------|
| `src/app/page.js` | `HomeLoginModal` | `marketing/HomeLoginModal` |
| `src/app/layout.js` | `ServiceWorkerRegister` | `shared/ServiceWorkerRegister` |
| `(marketing)/layout.js` | `Marketing` | `marketing/Marketing` |
| `(marketing)/contact/page.js` | `Marketing` | `marketing/Marketing` |
| `(marketing)/pricing/page.js` | `Marketing` | `marketing/Marketing` |
| `(marketing)/document-owners/page.js` | `Marketing` | `marketing/Marketing` → becomes `users/page.js` |
| `(marketing)/issuers/page.js` | `Marketing` | `marketing/Marketing` |
| `(marketing)/security/page.js` | `Marketing` | `marketing/Marketing` |
| `login/page.js` | `LoginPasskeyForm` | `auth/LoginPasskeyForm` |
| `register/page.js` | `RegisterPasskeyForm` | `auth/RegisterPasskeyForm` |
| `account-recovery/recovery-code/page.js` | `RecoveryCodeLoginForm` | `auth/RecoveryCodeLoginForm` |
| `login/remote-approve/page.js` | `LoginRemoteApproveForm` | `auth/LoginRemoteApproveForm` |
| `login/remote-approve/scan/page.js` | `QrCodeScanner` | `integrations/QrCodeScanner` |
| `hoa-key/setup/page.js` | `HoaKeySetupForm` | `integrations/HoaKeySetupForm` |
| `hoa-key/remote-unlock/page.js` | `HoaKeyRemoteUnlockForm` | `integrations/HoaKeyRemoteUnlockForm` |
| `hoa-key/remote-unlock/scan/page.js` | `QrCodeScanner` | `integrations/QrCodeScanner` |
| `wallet/*` (9 pages + layout) | `PortalIcon`, `Wallet*`, `RegisterTrustedDevicePrompt`, `QrCodeScanner` | `shared/`, `signatura/` |
| `security/*` (5 pages + layout) | `DevicesPanel`, `AddPasskeyPanel`, `RecoveryCodesPanel`, `SecurityNavLinks` | `signatura/` |
| `issuer/*` (7 pages) | `Issuer*`, `TemplateCaptureDashboard`, `PortalIcon` | `issuer/`, `shared/` |
| `issuer-portal/layout.js` | `PortalIcon` | `shared/PortalIcon` |
| `admin/*` (7 pages + layout) | `PortalIcon`, `Admin*`, `RegisterIssuerModal` | `shared/`, `admin/` |

#### Inter-component imports (7+ sites)

| File | Change |
|------|--------|
| `auth/RegisterPasskeyForm.js` | `./PasskeyNotice` → `@/components/auth/PasskeyNotice` |
| `auth/LoginPasskeyForm.js` | `./LoginTrustedDeviceQrPanel` → `@/components/auth/LoginTrustedDeviceQrPanel` |
| `marketing/HomeLoginModal.js` | `./LoginModal` → `@/components/marketing/LoginModal` |
| `issuer/IssuerActivationForm.js` | `./PasskeyNotice` → `@/components/auth/PasskeyNotice` |
| `signatura/DevicesPanel.js` | `./PasskeyNotice` → `@/components/auth/PasskeyNotice` |
| `signatura/AddPasskeyPanel.js` | `./PasskeyNotice` → `@/components/auth/PasskeyNotice` |
| `integrations/QrCodeScanner.js` | `./PortalIcon` → `@/components/shared/PortalIcon` |
| `admin/AdminDigitizationDashboard.js` | `TemplateCaptureDashboard`, `PortalIcon` → `issuer/`, `shared/` |
| All `PortalIcon` consumers | `@/components/PortalIcon` → `@/components/shared/PortalIcon` |

**Optional:** Add `src/components/index.js` barrel re-exports during transition to reduce churn.

### 1.4 Rename `document-owners` → `users`

| Action | File / location |
|--------|-----------------|
| Move route | `(marketing)/document-owners/page.js` → `(marketing)/users/page.js` |
| Update nav | `marketing/Marketing.js` — `['/Owners', '/document-owners']` → `['/Users', '/users']` |
| Rename export (optional) | `DocumentOwnersPage` → `UsersPage` in `Marketing.js` |
| Add redirect | `/document-owners` → `/users` (301) |

### 1.5 Phase 1 redirects

| From | To |
|------|-----|
| `/document-owners` | `/users` |

### 1.6 Phase 1 RBAC

None — authenticated portal prefixes unchanged.

### 1.7 Phase 1 verification

- `npm test`
- `npm run build`
- Grep: no remaining flat `@/components/[A-Z]` imports (except barrels)
- Marketing nav resolves to `/users`

**Phase 1 files affected:** ~**50** (31 moves + ~19 import-only updates)

---

## Phase 2 — Portal Route Migration

**Goal:** Single issuer tree; unified owner portal under `/signatura`; dual-path support via redirects.

**Risk:** Medium–High  
**Deployable:** Yes — if legacy redirects remain for one release.

### 2.1 Remove `issuer-portal` duplication

#### Files to delete (11 re-export shims)

```
src/app/issuer-portal/page.js
src/app/issuer-portal/profile/page.js
src/app/issuer-portal/digital-documents/page.js
src/app/issuer-portal/activate/page.js
src/app/issuer-portal/templates/page.js
src/app/issuer-portal/revocation/page.js
src/app/issuer-portal/onboarding/page.js
src/app/issuer-portal/issuance/page.js
src/app/issuer-portal/bulk-upload/page.js
src/app/issuer-portal/audit/page.js
src/app/issuer-portal/api/page.js
```

#### Files to move / replace

| Action | File |
|--------|------|
| **Replace** | `src/app/issuer/layout.js` ← content from `issuer-portal/layout.js` (update nav hrefs to `/issuer/*`) |
| **Delete** | `src/app/issuer-portal/layout.js` (after merge) |
| **Delete** | entire `src/app/issuer-portal/` directory |

#### Issuer nav href updates (in merged layout)

| Current | New |
|---------|-----|
| `/issuer-portal` | `/issuer` |
| `/issuer-portal/issuance` | `/issuer/issuance` |
| `/issuer-portal/digital-documents` | `/issuer/digital-documents` |
| `/issuer-portal/templates` | `/issuer/templates` |
| `/issuer-portal/revocation` | `/issuer/revocation` |
| `/issuer-portal/audit` | `/issuer/audit` |
| `/issuer-portal/api` | `/issuer/api` |
| `/issuer-portal/profile` | `/issuer/profile` |

#### Issuer page internal links to update

| File | String |
|------|--------|
| `issuer/digital-documents/page.js` | `href="/issuer-portal/templates"` → `href="/issuer/templates"` |

**Note:** Onboarding (`/issuer/onboarding`) and activate (`/issuer/activate`) stay outside main portal nav; update invitation URLs separately (see §2.4).

### 2.2 Migrate `wallet` + `security` → `signatura`

#### Target route map

| New route | Source(s) |
|-----------|-----------|
| `/signatura/dashboard` | `wallet/page.js` |
| `/signatura/documents` | `wallet/credentials/page.js` |
| `/signatura/documents/issuers` | `wallet/issuers/page.js` |
| `/signatura/documents/issuers/[type]` | `wallet/issuers/[type]/page.js` |
| `/signatura/documents/issuers/issuer/[issuerId]` | `wallet/issuers/issuer/[issuerId]/page.js` |
| `/signatura/documents/scan` | `wallet/scan/page.js` |
| `/signatura/trusted-devices` | `security/devices/page.js` |
| `/signatura/trusted-devices/add` | `security/add-device/page.js` |
| `/signatura/trusted-devices/add-passkey` | `security/add-passkey/page.js` |
| `/signatura/settings` | `wallet/settings/page.js` |
| `/signatura/settings/security` | `wallet/profile/page.js` (security hub cards) |
| `/signatura/settings/recovery-codes` | `security/recovery-codes/page.js` |

#### Files to create (move)

```
src/app/signatura/layout.js
src/app/signatura/dashboard/page.js
src/app/signatura/documents/page.js
src/app/signatura/documents/issuers/page.js
src/app/signatura/documents/issuers/[type]/page.js
src/app/signatura/documents/issuers/issuer/[issuerId]/page.js
src/app/signatura/documents/scan/page.js
src/app/signatura/trusted-devices/page.js
src/app/signatura/trusted-devices/add/page.js
src/app/signatura/trusted-devices/add-passkey/page.js
src/app/signatura/settings/page.js
src/app/signatura/settings/security/page.js
src/app/signatura/settings/recovery-codes/page.js
```

**Total new signatura route files:** 12  
**Total deleted after cutover:** 14 (`wallet/*` 9 + `security/*` 5)

#### Layout consolidation

- Single `signatura/layout.js` with desktop nav + `signatura/BottomNav.js`
- Remove `security/layout.js` — trusted-device pages inherit signatura layout
- `SecurityNavLinks` hrefs updated to `/signatura/trusted-devices/*` and `/signatura/settings/*`

### 2.3 Every redirect required (Phase 2)

#### Issuer (invert current proxy behavior)

| From | To |
|------|-----|
| `/issuer-portal` | `/issuer` |
| `/issuer-portal/*` | `/issuer/*` (path-preserving) |

**Remove:** redirect `/issuer/*` → `/issuer-portal/*` in `src/proxy.js`

#### Owner portal

| From | To |
|------|-----|
| `/wallet` | `/signatura/dashboard` |
| `/wallet/credentials` | `/signatura/documents` |
| `/wallet/issuers` | `/signatura/documents/issuers` |
| `/wallet/issuers/[type]` | `/signatura/documents/issuers/[type]` |
| `/wallet/issuers/issuer/[issuerId]` | `/signatura/documents/issuers/issuer/[issuerId]` |
| `/wallet/scan` | `/signatura/documents/scan` |
| `/wallet/settings` | `/signatura/settings` |
| `/wallet/profile` | `/signatura/settings/security` |
| `/wallet/shared` | `/signatura/documents` *(stub — page never existed)* |
| `/wallet/export` | `/signatura/documents` |
| `/wallet/history` | `/signatura/documents` |
| `/wallet/backup` | `/signatura/settings/security` |
| `/security/devices` | `/signatura/trusted-devices` |
| `/security/add-device` | `/signatura/trusted-devices/add` |
| `/security/add-passkey` | `/signatura/trusted-devices/add-passkey` |
| `/security/recovery-codes` | `/signatura/settings/recovery-codes` |
| `/security/*` (catch-all) | `/signatura/trusted-devices` |

**Implementation:** `next.config.mjs` `redirects()` + proxy matcher updates.

### 2.4 RBAC updates required

#### `src/lib/roles.js`

| Key | Current | New |
|-----|---------|-----|
| `PORTAL_ACCESS` key | `'/wallet'` | `'/signatura'` |
| `PORTAL_ACCESS` key | `'/issuer-portal'` | `'/issuer'` |
| `PORTAL_ACCESS` key | `'/admin'` | unchanged |
| `ROLE_HOME[DOCUMENT_OWNER]` | `'/wallet'` | `'/signatura/dashboard'` |
| `ROLE_HOME[ISSUER_ADMIN]` | `'/issuer-portal'` | `'/issuer'` |
| `ROLE_HOME[ISSUER_STAFF]` | `'/issuer-portal'` | `'/issuer'` |
| `ROLE_HOME[SIGNATURA_*]` | `'/admin'` | `'/admin'` *(or `/admin/dashboard` in later admin rename)* |

**Dual-support period:** `roleCanAccessPath` should accept **both** old and new prefixes until redirects are removed.

#### `src/proxy.js` + root `proxy.js`

| Change | Detail |
|--------|--------|
| `PORTAL_PREFIXES` | `['/signatura', '/issuer', '/admin']` (+ legacy `/wallet`, `/issuer-portal` during soak) |
| `matcher` | Add `/signatura/:path*`; keep legacy matchers during soak |
| Remove | `/issuer` → `/issuer-portal` redirect block |
| Add | Legacy prefix redirects to new prefixes (or rely on `next.config` redirects) |
| Activate exception | `/issuer/activate` stays public (no RBAC gate) |

#### Auth / session next-path allowlists

| File | Updates |
|------|---------|
| `src/app/api/auth/login/finish/route.ts` | Allow `/signatura/*`; map legacy `/wallet/*`, `/issuer-portal/*` |
| `src/app/api/auth/recovery-code/route.ts` | Default next `/signatura/trusted-devices`; issuer `/issuer`; recovery flow paths |
| `src/lib/auth/loginSession.js` | Same allowlist as login/finish |
| `src/lib/trustedDeviceLoginChallenge.js` | Default `nextPath` `/signatura/dashboard` |
| `src/app/api/auth/login/remote/start/route.js` | Default next `/signatura/dashboard` |
| `src/app/api/auth/session/route.js` | Uses `ROLE_HOME` — auto-fixed when roles.js updates |
| `src/app/api/issuer-invitations/activation/finish/route.ts` | `next: '/issuer'` |
| `src/app/api/issuer-invitations/route.ts` | Invite URL `/issuer/activate?token=...` |

#### `src/lib/signaturaHome.js`

| Change |
|--------|
| `fallback = '/signatura/dashboard'` (was `/wallet`) |

### 2.5 All hardcoded route strings to update (Phase 2)

Grouped by file — **~85 string occurrences across 35 files**.

#### Marketing / auth entry

| File | Strings |
|------|---------|
| `marketing/LoginModal.js` | `/login?next=/wallet` → `/signatura/dashboard`; `/login?next=/issuer-portal` → `/issuer` |
| `marketing/Marketing.js` | `RoleAccessPanel` portal targets via `ROLE_HOME` |
| `app/page.js` | `/login?next=/wallet`, `/issuer-portal/onboarding` → `/issuer/onboarding` |

#### Auth components

| File | Strings |
|------|---------|
| `auth/LoginPasskeyForm.js` | `nextPath = '/wallet'`; `/issuer-portal` branch; `registerDeviceHref` |
| `auth/LoginTrustedDeviceQrPanel.js` | `nextPath = '/wallet'`; `registerDeviceHref` |
| `auth/RegisterPasskeyForm.js` | `nextPath = '/wallet'`; `/security/devices`; `/login?next=/issuer-portal` |
| `auth/RecoveryCodeLoginForm.js` | `nextPath = '/wallet'`; `/security/add-passkey` redirect |
| `auth/LoginRemoteApproveForm.js` | `homeHref = '/wallet'` |

#### Signatura components

| File | Strings |
|------|---------|
| `signatura/BottomNav.js` | All `/wallet/*` nav; `/security/*` active detection |
| `signatura/SecurityNavLinks.js` | All 4 `/security/*` links |
| `signatura/RegisterTrustedDevicePrompt.js` | `/wallet`, `/security/add-device` |
| `signatura/AddPasskeyPanel.js` | `/security/devices`, `nextPath` defaults |
| `signatura/DevicesPanel.js` | `/security/add-device` |
| `signatura/IssuerDirectory.js` | `/wallet/issuers/issuer/` links |

#### Issuer components

| File | Strings |
|------|---------|
| `issuer/IssuerActivationForm.js` | `/issuer-portal`, `/login?next=/issuer-portal` |

#### App pages (defaults)

| File | Strings |
|------|---------|
| `login/page.js` | default `nextPath` `/wallet` |
| `register/page.js` | default `nextPath` `/wallet` |
| `account-recovery/page.js` | `/wallet` |
| `account-recovery/recovery-code/page.js` | `/wallet` |
| `security/add-device/page.js` | fallback `/wallet` |
| `security/add-passkey/page.js` | fallback `/wallet` |
| `signatura/dashboard/page.js` (moved) | internal card hrefs (6 stub links) |
| `signatura/settings/security/page.js` | 4 `/security/*` action hrefs |
| `wallet/issuers/*/page.js` | back-links (updated on move) |

#### HOA / integrations

| File | Strings |
|------|---------|
| `integrations/HoaKeyRemoteUnlockForm.js` | `homeHref = '/wallet'` |
| `hoa-key/setup/page.js` | `?? '/wallet'` |
| `hoa-key/remote-unlock/page.js` | `?? '/wallet'` (×2) |
| `hoa-key/remote-unlock/scan/page.js` | `?? '/wallet'` |
| `login/remote-approve/page.js` | `?? '/wallet'` (×2) |
| `login/remote-approve/scan/page.js` | `?? '/wallet'` |

#### Public / PWA

| File | Strings |
|------|---------|
| `public/manifest.json` | `start_url`, shortcuts `/wallet`, `/issuer-portal` |
| `public/sw.js` | precache `/wallet`, `/issuer-portal` |

#### Tests

| File | Strings |
|------|---------|
| `test/trusted-device-login.integration.test.mjs` | `nextPath: '/wallet'` (×4) |
| `test/auth-zero-trust.integration.test.mjs` | `nextPath: '/wallet'` (×2) |

#### Marketing content

| File | Strings |
|------|---------|
| `app/use-cases/[slug]/page.js` | `/issuer-portal/onboarding` (×2) |

**API path strings NOT in scope** (remain `/api/security/*`, `/api/issuer/*`):  
`passkey-client.js`, `DevicesPanel` fetch URLs, `RecoveryCodesPanel`, `Issuer*` fetch URLs, `Admin*` fetch URLs.

### 2.6 Phase 2 verification

- All issuer-portal URLs 301 to `/issuer/*`
- All wallet/security URLs 301 to `/signatura/*`
- Demo role cookie → correct new home
- Passkey login `next` param works for all portals
- Issuer invitation email links resolve
- HavenxSig OAuth `next` params (if any) still valid
- `npm test` + `npm run build`

**Phase 2 files affected:** ~**45** (12 creates + 14 deletes + ~19 RBAC/route string files)

---

## Phase 3 — Cleanup, Hardening, and Boundary Enforcement

**Goal:** Remove legacy routes, enforce import boundaries, fix shared-kernel leaks, update docs.

**Risk:** Medium  
**Deployable:** After soak period (1 release recommended).

### 3.1 Delete legacy route trees

```
src/app/wallet/          (entire tree — after redirects verified)
src/app/security/        (entire tree)
src/app/issuer-portal/   (should already be gone from Phase 2)
src/app/issuer/layout.js (old light-theme stub — if not already replaced)
```

### 3.2 Remove dual-prefix RBAC support

| File | Action |
|------|--------|
| `src/lib/roles.js` | Remove legacy `/wallet`, `/issuer-portal` from `PORTAL_ACCESS` |
| `src/proxy.js` | Remove legacy matchers |
| `proxy.js` (root) | Sync matcher |
| Auth allowlists | Remove legacy path branches |

### 3.3 Split shared-kernel violation (from Dependency Review)

| Task | Detail |
|------|--------|
| Extract `TemplateWorkspace` | From `issuer/TemplateCaptureDashboard.js` → `shared/template/TemplateWorkspace.js` |
| Issuer wrapper | `issuer/TemplateCaptureDashboard.js` — thin wrapper, `apiBase='/api/issuer/templates'` |
| Admin wrapper | `admin/AdminTemplateWorkspace.js` — wraps shared workspace, `apiBase='/api/admin/templates'` |
| Update `admin/AdminDigitizationDashboard.js` | Import admin wrapper, not issuer component |

### 3.4 Consolidate duplicate flows

| Duplicate | Resolution |
|-----------|------------|
| `admin/issuers/page.js` inline invite modal | Extract `admin/InviteIssuerModal.js` or reuse `issuer/IssuerInvitationForm` via admin wrapper |
| `app/page.js` vs `marketing/Marketing.js` | Move home content under `(marketing)/page.js`; slim root or redirect `/` → marketing group |

### 3.5 Import boundary enforcement (recommended)

Add ESLint / CI rule:

```
admin/*     → may import admin/, shared/, auth/ — NOT issuer/, signatura/
issuer/*    → may import issuer/, shared/, auth/ — NOT admin/, signatura/
signatura/* → may import signatura/, shared/, auth/ — NOT admin/, issuer/
marketing/* → may import marketing/, shared/, auth/
```

### 3.6 Documentation updates

| Doc | Update |
|-----|--------|
| `docs/PORTAL_DEPENDENCY_REVIEW.md` | Mark violations resolved |
| `README.md` | Route examples |
| This document | Track completion per phase |

### 3.7 Phase 3 verification

- Grep: zero `/issuer-portal`, `/wallet`, `/security/` in `src/` (except redirects config and changelog)
- Grep: zero flat `@/components/[A-Z]` imports
- `npm test` (update assertions to `/signatura/dashboard`)
- Manual: PWA install opens correct `start_url`
- Manual: external bookmarks / HavenxSig deep links

**Phase 3 files affected:** ~**20** (deletions + TemplateCapture split + lint config + tests + docs)

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Broken bookmarks / OAuth `next` params** | High | Keep 301 redirects for 1+ release; dual-prefix RBAC during soak |
| **`/security` name collision** | Medium | Owner routes under `/signatura/trusted-devices`; marketing stays `/security` |
| **Issuer invitation emails** | High | Update `api/issuer-invitations/route.ts` URL before cutting `/issuer-portal` |
| **PWA manifest / service worker** | Medium | Update `manifest.json` + `sw.js` in Phase 2, verify install flow in Phase 3 |
| **Demo RBAC cookie / `ROLE_HOME`** | High | Update `roles.js` + `api/auth/session` together with proxy |
| **TemplateCaptureDashboard admin→issuer coupling** | Medium | Defer split to Phase 3; don't block route migration |
| **Missing wallet pages (shared/export/history/backup)** | Low | Redirect stubs to nearest signatura route; remove dead links from dashboard |
| **Test drift** | Medium | Update integration tests in same PR as route migration |
| **Large PR scope** | Medium | Land Phase 1 separately; Phase 2 as one coordinated release |

---

## Estimated File Count Affected

| Category | Count |
|----------|-------|
| Component files moved | 31 |
| Component inter-import updates | ~15 |
| App page import updates | ~42 |
| New `signatura/` route files | 12 |
| Deleted `wallet/` + `security/` files | 14 |
| Deleted `issuer-portal/` files | 12 |
| Issuer layout merge | 2 (1 replace, 1 delete) |
| Marketing `users` rename | 2 |
| Lib / RBAC / auth files | 8 |
| Proxy files | 2 |
| Public (manifest, sw) | 2 |
| Test files | 3 |
| Hardcoded route string files | ~35 |
| Phase 3 split / cleanup | ~8 |
| **Total unique files touched** | **~90–100** |

| Phase | Files (approx.) |
|-------|-------------------|
| Phase 1 | ~50 |
| Phase 2 | ~45 |
| Phase 3 | ~20 |
| **Overlap** | ~15 files touched in multiple phases |

---

## Recommended Execution Order

```
Phase 1:
  1. Create component folders + move files
  2. Update all imports (app + components)
  3. Rename document-owners → users + redirect
  4. Test + build

Phase 2:
  1. Add next.config redirects (legacy → new) BEFORE deleting old trees
  2. Merge issuer-portal layout into issuer/layout.js
  3. Delete issuer-portal re-exports
  4. Invert proxy (stop /issuer → /issuer-portal)
  5. Create signatura/ route tree
  6. Update roles.js + proxy matchers (dual support)
  7. Update all hardcoded route strings (§2.5)
  8. Update manifest + sw + tests
  9. Delete wallet/ + security/ trees
  10. Test + build

Phase 3:
  1. Remove dual-prefix RBAC
  2. Split TemplateCaptureDashboard
  3. Consolidate invite flow + marketing home
  4. Add import lint rules
  5. Final test + doc update
```

---

## Out of Scope (Future Phases)

- Admin route rename (`/admin` → `/admin/dashboard`, etc.)
- Issuer route rename (`/issuer` → `/issuer/dashboard`, etc.)
- API namespace migration (`/api/security` → `/api/signatura`)
- `use-cases/` move under `(marketing)/` route group
- `pricing/` marketing page fate

---

## Related Documents

- [PORTAL_DEPENDENCY_REVIEW.md](./PORTAL_DEPENDENCY_REVIEW.md) — cross-portal import and boundary analysis
- [OPENTIMESTAMPS_REVIEW.md](./OPENTIMESTAMPS_REVIEW.md)
- [SIGNATURA_ZERO_TRUST_REFACTOR_REPORT.md](./SIGNATURA_ZERO_TRUST_REFACTOR_REPORT.md)
- [ZERO_TRUST_GAP_ANALYSIS.md](./ZERO_TRUST_GAP_ANALYSIS.md)

---

*This document is an implementation plan only. No repository code was modified to produce it.*
