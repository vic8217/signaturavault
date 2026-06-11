# Demo Presentation Readiness Review

**Date:** 2026-06-08  
**Audience:** Non-technical HOA officers, school registrars, clinic administrators  
**Scope:** UI/UX and presentation readiness only — no backend or code changes reviewed for implementation.

---

## Executive summary

Signatura has **strong visual polish** on its core dark-theme portals and a **scriptable school document-request demo** after `npm run demo:seed-signatura`. For live presentations to non-technical audiences, the product still reads as a **security-engineering platform** more than an **everyday records office tool**. Technical labels, developer placeholders, stub pages, and partner-product jargon (HavenxSig, HOA key, Prisma) create narration risk even when the underlying flows work.

### Overall demo score: **6 / 10**

| Experience area | Score | One-line verdict |
|-----------------|-------|------------------|
| Owner experience | 6.5 | Polished wallet/documents UI; misleading home cards and raw status labels |
| Issuer experience | 6.5 | Request inbox is demo-ready; issue form and stub nav pages are not |
| Public verification | 6 | API-backed `/verify` works; results feel like a developer console |
| Mobile / PWA | 7 | Bottom nav, manifest, install hint — good mobile shell; scan/verify split across URLs |
| HOA demo | 4 | Powerful but HavenxSig-centric, crypto-heavy, not self-explanatory |
| School demo | 7.5 | Best scripted path; seed + docs align with registrar story |

---

## 1. Owner experience

### Screenshots / pages involved

| Page | URL | Demo role |
|------|-----|-----------|
| Owner home | `/signatura/dashboard` | Opening slide — “your credentials in one place” |
| My Documents | `/signatura/documents` | **Primary demo** — request, track, credentials |
| QR scanner | `/signatura/documents/scan` | Mobile verify / scan moment |
| Issuer directory | `/signatura/documents/issuers` | “Who can issue to me” |
| Trusted devices | `/signatura/trusted-devices` | Security setup (pre-demo) |
| Register / login | `/register`, `/login` | Account bootstrap |
| Settings | `/signatura/settings`, `/signatura/settings/security` | Recovery, privacy (secondary) |

**Screenshot-worthy:** `/signatura/documents` (hero + request form + credentials list), owner home hero, QR scanner camera frame.

**Avoid in screenshots:** Raw `Status: valid · Anchor: published` on credential cards; empty trusted-devices list with no guidance.

### Missing UI polish

- **Six home cards, four dead ends** — Shared Documents, Share & Export, and Verification History all route to `/signatura/documents` but promise distinct features (`src/app/wallet/page.js`).
- **Credential status line** shows API field names (`verificationStatus`, `anchorStatus`) instead of human labels like “Valid” / “On file with issuer” (`DocumentRequestsPanel.js`).
- **Trusted devices empty state** — blank list after load; no “Add your first device” CTA (`DevicesPanel.js`).
- **Document requests empty state** — “No document requests yet” with no prompt to open the request form.
- **Settings privacy toggles** — labels imply live features (analytics, notifications) with no “coming soon” or persistence indication.

### Confusing terminology

| Term shown | Why it confuses |
|------------|-----------------|
| **Document Wallet** vs **Owner Portal** | Layout says “Owner Portal”; home says “Document Wallet” |
| **Document owner** | Students/patients/residents are not “owners” in everyday language |
| **Participating issuers** | Bureaucratic; registrars think “schools” or “offices” |
| **Trusted device** | Sounds like IT asset management |
| **Encrypt your request at submit time** | Correct but scary without a plain-language benefit |
| **Signatura wallet** | Academic/clinical audiences expect “my records” or “student portal” |
| **Blockchain anchors** | Home “How it works” — implies on-chain personal data |

### Technical wording to simplify

- “Submit will verify this trusted device and encrypt your request at submit time” → *“We’ll confirm it’s you, then send your details securely to the school.”*
- “No credentials in your wallet yet… wallet delivery” → *“No documents here yet. Your school will deliver them after approval.”*
- “Status: valid · Anchor: published” → *“Document status: Valid · Record sealed by issuer”*
- “Request a digital copy” → *“Request an official copy”* (registrars/clinics understand this)

### Demo risks

- Passkey reverify on submit (5-minute window) — presenter pause mid-demo.
- Misleading home cards — audience asks for “Verification History” and lands on same page.
- **Role cookie gap** — demo docs reference home-page “Document Owner” button; live `/` login modal only links to wallet/issuer login, not role switchers (`Marketing.js` `RoleAccessPanel` is unused on `/`).
- Registration requires **handphone** + recovery phrase — long preamble before request flow.

---

## 2. Issuer experience

### Screenshots / pages involved

| Page | URL | Demo role |
|------|-----|-----------|
| Issuer dashboard | `/issuer` | Metrics, recent activity opener |
| Request inbox | `/issuer/requests` | **Primary demo** — approve, deny, issue |
| Issuer profile | `/issuer/profile` | “Accept document requests” toggle |
| Digital documents | `/issuer/digital-documents` | Template gallery |
| Issuance | `/issuer/issuance` | Secondary — manual issue |
| Staff activation | `/issuer/activate` | Pre-demo staff setup |
| Onboarding / invite | `/issuer/onboarding` | Admin-only setup |

**Screenshot-worthy:** `/issuer/requests` (inbox + decrypted fields + approve), `/issuer` dashboard tiles, `/issuer/profile` accepts-requests toggle.

**Avoid in screenshots:** `/issuer/revocation`, `/issuer/api`, `/issuer/audit`, `/issuer/bulk-upload` (light-theme stubs); issue form placeholders “Prisma document record ID”, “SHA-256 document hash”; `/issuer/templates` (light theme break).

### Missing UI polish

- **Mark issued form** exposes developer placeholders: “Existing Prisma document record ID”, “SHA-256 document hash” (`IssuerRequestsPanel.js`).
- **Issuance panel** — template preview without submit; dead-end for “issue from template” demo.
- **Sidebar includes stub destinations** — Revocation, API in nav; Audit/Bulk hidden but Revocation/API still clickable marketing shells.
- **Theme inconsistency** — Templates, Revocation, API, Audit use white/zinc cards on dark issuer shell.
- **Dashboard disabled actions** — “Verification logs coming soon” undermines “full platform” narrative.
- **Onboarding form** asks for **Tenant ID** and **Issuer ID** — not registrar-friendly.

### Confusing terminology

| Term shown | Why it confuses |
|------------|-----------------|
| **Owner document requests** | “Owner” again; registrars say “student requests” |
| **Private request fields** | Sounds like a bug (“why is it private?”) |
| **Decrypted only for authorized issuer staff** | Accurate but alarming without context |
| **Mark issued** vs **Deliver to owner Signatura wallet** | Two concepts collapsed into one form |
| **Tenant** (dashboard metric) | Internal ops term |
| **ISSUER_ADMIN / ISSUER_STAFF** | Raw enum in invitation form |
| **Merkle inclusion / anchor** | On document summary tables |

### Technical wording to simplify

- “Review encrypted owner submissions” → *“Review student requests (contact details are protected)”*
- “Link existing document record” → *“Link an existing issued document”*
- “Or create from document hash” → *“Or register document fingerprint”* (or hide behind “Advanced”)
- “Deliver to owner Signatura wallet” → *“Send digital copy to the student’s Signatura app”*
- Denial placeholder “Reason shown only to issuer staff” → *“Internal note (not shared with student)”* — actually denial reason may go to owner; copy is **wrong for demo** and should be clarified in script

### Demo risks

- Presenter must pre-activate staff via seeded token URL — not discoverable in UI.
- Approve → issue is two steps; easy to skip wallet-delivery checkbox.
- Clicking **Revocation** or **API** in sidebar breaks immersion (obvious placeholders).
- Issuer staff cannot demo if `IssuerUser` link missing — opaque 403.

---

## 3. Public verification experience

### Screenshots / pages involved

| Page | URL | Demo role |
|------|-----|-----------|
| Public verify | `/verify`, `/verify?token=…` | **Primary** — paste token, show result |
| QR scanner (owner) | `/signatura/documents/scan` | Phone camera demo |
| Verify API | `GET /api/verify/[token]` | Backup / technical audience only |

**Screenshot-worthy:** `/verify` with green “Verification result” card; credential **Verify document** link landing with `?token=`.

**Caveat:** `/verify` copy says “Scan a QR code” but **has no camera** — scan lives on `/signatura/documents/scan`.

### Missing UI polish

- No issuer name or document type on verify result — only `document_id`, statuses, timestamps.
- **Document hash match**, **Merkle proof**, **Anchor status** read as engineering output, not registrar/HOA language.
- No “What this means for employers/embedassy” plain summary (e.g. “This transcript is authentic and not revoked”).
- Error state is a single red line — no guidance to retry or contact issuer.
- Scanner page mentions **ngrok** and **hoa-key** in placeholders — dev environment leakage.

### Confusing terminology

| Term shown | Why it confuses |
|------------|-----------------|
| **Verification token** | Registrars say “QR code” or “reference number” |
| **Token valid** | Sounds like session/login token |
| **Document hash match** | Implies blockchain/crypto class |
| **Merkle proof** | Immediately loses HOA boards and clinic admins |
| **Anchor status** | “Anchored” means nothing to registrars |
| **Private fields redacted** | Good concept, awkward phrasing — “Personal details hidden” |

### Technical wording to simplify

- “Document hash match: Yes” → *“Document fingerprint matches issuer records: Yes”*
- “Merkle proof: Available” → *“Independent audit trail: Available”* or hide behind “Technical details”
- “Anchor status: published” → *“Issuer seal: Confirmed”*
- Page title “Verify Document” → add subtitle: *“For employers, schools, and agencies — no account required”*

### Demo risks

- Presenter scans QR on `/verify` — no camera; looks broken.
- Demo on HTTP localhost — camera blocked; must use HTTPS or paste token.
- Technical result card undermines “simple QR check” story for non-technical buyers.

---

## 4. Mobile / PWA experience

### Screenshots / pages involved

| Surface | Location | Demo role |
|---------|----------|-----------|
| PWA install | Owner layout `PwaInstallHint` | “Add to home screen” |
| Bottom nav | `WalletBottomNav` — Main, Wallet, Scan, Issuers, Security | Phone walkthrough |
| Manifest shortcuts | Install → Owner / Issuer / Verify | Power-user entry |
| Login QR approval | `/login` trusted-device flow | Cross-device auth story |

**Screenshot-worthy:** Bottom nav on phone, scanner full-screen frame, standalone PWA chrome.

### Missing UI polish

- Manifest `start_url` is `/signatura/dashboard` — installed app opens **logged-in owner portal**, not marketing or verify; confusing for first-time installers.
- Manifest description leads with **“Zero Trust Level 2… blockchain anchoring”** — not buyer-friendly.
- `userScalable: false` — accessibility concern for older administrators.
- Bottom nav label **“Wallet”** routes to documents but nav says Wallet — same naming drift.
- No offline explanation when SW serves `offline.html` during demo network blip.

### Confusing terminology

| Term shown | Why it confuses |
|------------|-----------------|
| **Zero Trust Level 2** (manifest) | Security certification language on app icon screen |
| **Trusted device** (install hint) | “Install on your trusted device” — circular if they don’t have one yet |
| **Main** vs **Wallet** (bottom nav) | Unclear distinction |

### Demo risks

- Passkey / WebAuthn on mobile browsers varies — rehearse on target device.
- QR scan requires **BarcodeDetector** — not all mobile browsers; manual paste fallback must be in script.
- Presenter installs PWA — lands on dashboard redirect to login if session expired.

---

## 5. HOA demo experience

### Screenshots / pages involved

| Page | URL | Demo role |
|------|-----|-----------|
| HOA key setup | `/hoa-key/setup?tenantId=…` | Admin encryption enrollment |
| Remote unlock | `/hoa-key/remote-unlock` | Phone approves desktop |
| Remote unlock scan | `/hoa-key/remote-unlock/scan` | QR from desktop partner app |
| Marketing HOAs | `/issuers` (hero pills) | Positioning only — no dedicated HOA use-case page |

**Screenshot-worthy:** Remote unlock approve screen with short code; setup “Generate key” card (with strong caveats).

**Not screenshot-worthy for HOA boards:** Zero Trust copy blocks, HavenxSig return paths, checkbox legalisms about “HOA-controlled vault.”

### Missing UI polish

- No **standalone HOA story page** in use-cases (unlike universities, medical-records).
- Entire flow assumes **HavenxSig** desktop app — not self-contained in Signatura alone.
- No plain diagram: “Phone approves computer” for board members.
- Setup success redirects to partner product — demo audience may not have it running.

### Confusing terminology

| Term shown | Why it confuses |
|------------|-----------------|
| **HOA encryption key** | Boards think records and payments, not encryption keys |
| **Key reference / enroll** | IT vocabulary |
| **HavenxSig** | Unknown product; looks like internal tooling |
| **Zero Trust Level 2 private-field access** | Compliance deck language |
| **Remote unlock** | Sounds like smart-lock / physical access |
| **Wrapped for that browser only** | Engineering explanation |

### Technical wording to simplify

- “Authorize browser session” → *“Approve office computer access from your phone”*
- “HOA encryption setup” → *“Protect resident records — one-time setup”*
- “Return to HavenxSig” → *“Return to your records portal”* (white-label in demo script)

### Demo risks

- **Highest narration risk** of all verticals for non-technical HOA officers.
- Requires pre-enrolled phone key + HavenxSig session + passkey — fragile chain.
- HOA officers may fear resident data “encryption” means they lose access.
- Not viable as impromptu demo without partner environment.

**Recommendation:** Use HOA only as a **security appendix** or pre-recorded segment unless HavenxSig is live in the room.

---

## 6. School demo experience

### Screenshots / pages involved

| Page | URL | Demo role |
|------|-----|-----------|
| Use case: Universities | `/use-cases/universities` | Pre-demo positioning |
| Use case: Registrar systems | `/use-cases/registrar-systems` | IT/registrar buyer slide |
| Issuers marketing | `/issuers` | TOR/COE sample IDs in preview |
| Owner request flow | `/signatura/documents` | Student requests transcript |
| Issuer inbox | `/issuer/requests` | Registrar approves |
| Public verify | `/verify?token=…` | Employer verifies |

**Seeded demo issuer:** Request Demo University (`issuer_request_demo`), Official Transcript, student number field.

**Screenshot-worthy:** Marketing university use-case, request form with Purpose + Student number, issuer approve screen, credential in My Credentials.

### Missing UI polish

- Seeded issuer `type: education` may not match marketing label **“Educational institutions”** in directory UI.
- **Enrollment Verification** document type seeded but **not requestable** (no published template) — confusing if shown in DB/docs.
- Marketing preview uses **TOR-2026-0412** — strong for Philippines registrars, opaque elsewhere.
- No in-app “School demo mode” banner — presenter must remember seeded names.

### Confusing terminology

| Term shown | Why it confuses |
|------------|-----------------|
| **TOR** | Philippines-specific (Transcript of Records) |
| **Document owner** | Should be **student** in school script |
| **Request Demo University** | Obviously synthetic — fine for dev, weak for production-style pitch |
| **Student number** vs **Student ID** | Minor regional variance |
| **SIG-… Signatura ID** | New ID scheme to explain before login |

### Demo risks

- Strongest vertical **if scripted** (`docs/DEMO_SIGNATURA_REQUEST_FLOW.md`).
- Still requires live passkey registration + staff activation — 10–15 min preamble.
- Clinic vertical has **marketing** (`/use-cases/medical-records`) but **no seeded clinic demo** — don’t improvise clinic flow without seed data.

---

## Top 10 UI improvements (presentation impact)

| # | Improvement | Primary audience | Pages affected |
|---|-------------|------------------|----------------|
| 1 | Replace or disable misleading owner home cards (Shared Documents, Verification History) | All | `/signatura/dashboard` |
| 2 | Humanize credential status (remove raw `anchorStatus` / API enums) | Students, patients | `/signatura/documents` |
| 3 | Hide or relabel issuer issue-form dev placeholders (Prisma ID, SHA-256) | Registrars | `/issuer/requests` |
| 4 | Add issuer name + document type to public verify result card | Verifiers, employers | `/verify` |
| 5 | Add camera or “Open scanner” link on `/verify` | Public verify | `/verify` |
| 6 | Unify issuer portal theme — remove light-theme stubs from nav or restyle | Registrars | `/issuer/revocation`, `/api`, `/templates` |
| 7 | Empty states with CTAs (trusted devices, no requests, no credentials) | All owners | `/signatura/trusted-devices`, `/signatura/documents` |
| 8 | Mount dev role-access panel on demo home or document in presenter guide | Presenters | `/` vs `Marketing.js` |
| 9 | Remove ngrok / hoa-key from public scanner placeholder text | All | `/signatura/documents/scan` |
| 10 | School demo banner: “Demo university — Official Transcript request” | Registrars | `/signatura/documents`, `/issuer/requests` |

---

## Top 10 terminology improvements

| # | Current | Suggested plain language | Audiences |
|---|---------|------------------------|-----------|
| 1 | Document owner | Student / patient / resident (context label) | All |
| 2 | Owner Portal / Document Wallet | My records / Student portal (school) | School, clinic |
| 3 | Zero Trust Level 2 | Bank-grade security (or drop on consumer surfaces) | HOA, clinic |
| 4 | Trusted device | Your registered phone | All non-technical |
| 5 | Participating issuers | Schools and organizations that use Signatura | Students |
| 6 | Encrypt / decrypted | Protected / visible to staff only | Registrars, HOA |
| 7 | Merkle proof / anchor status | Audit trail / issuer seal | Verifiers |
| 8 | Document hash match | Record matches issuer’s copy | Employers |
| 9 | Tenant / tenant ID | Organization / campus ID | Issuer staff |
| 10 | HOA encryption key / key reference | Community records protection key | HOA officers |

---

## Pages that need better explanations

| Page | What’s missing |
|------|----------------|
| `/signatura/documents` | One-line “What happens after I submit?” timeline (pending → approved → issued) |
| `/issuer/requests` | Explain encrypted fields: “Student contact info is protected in transit” |
| `/verify` | Plain verdict line: “Authentic and valid” vs “Revoked or not found” above technical fields |
| `/signatura/dashboard` | Clarify which cards are available today vs roadmap |
| `/issuer/issuance` | Difference between manual issuance and request-based issuance |
| `/hoa-key/setup` | Why setup is needed — board-friendly 2–3 sentences |
| `/hoa-key/remote-unlock` | Diagram: computer shows QR → phone approves |
| `/register` | Why recovery phrase matters — without “Zero Trust” lead |
| `/login` | Primary path is phone approval — reorder copy so passkey-on-desktop is clearly secondary |
| `/use-cases/medical-records` | Clarify no public medical file is exposed on verify |

---

## Pages that need onboarding / help text

| Page | Suggested help |
|------|----------------|
| `/signatura/trusted-devices` | First-run: “Register the phone you’ll use to approve requests” |
| `/signatura/documents` (request form) | Tooltip on Purpose / Student number; encryption note in plain language |
| `/issuer/activate` | “Registrar staff: complete this once before opening the request inbox” |
| `/issuer/requests` (mark issued) | Step help: “Check ‘Send to student app’ to deliver to My Credentials” |
| `/signatura/documents/scan` | “Works on phone over HTTPS; paste link if camera unavailable” |
| `/verify` | “Employers and schools: paste the QR link from the document” |
| `/issuer/onboarding` | Replace Tenant ID / Issuer ID with org name search or hide behind admin |
| `/signatura/settings` | Mark non-functional toggles as “Planned” |
| `/issuer` dashboard | Glossary tooltip for metrics (pending requests, anchor pending) |
| `/issuers` marketing | Short “How a registrar uses this in one day” callout box |

---

## Recommended demo flow

### Primary: School registrar end-to-end (live, ~20 min)

**Before the room**

1. `npm run demo:seed-signatura`
2. Register **student** passkey account (Browser A)
3. Activate **registrar staff** via seeded URL (Browser B)
4. `npm run dev:lan:https` — HTTPS for passkeys/camera
5. Prepare demo hash: `sha256:demo-transcript-2026-0042-deadbeefcafe`

**Narration script**

| Act | URL | Story beat |
|-----|-----|------------|
| 1 — Position | `/use-cases/universities` or `/issuers` | “Registrar issues once; student and employer trust the source” |
| 2 — Student requests | `/signatura/documents` | Request Official Transcript from Request Demo University |
| 3 — Registrar reviews | `/issuer/requests` | Show protected student details; Approve |
| 4 — Registrar issues | `/issuer/requests` | Enter hash; check deliver to student app; Mark issued |
| 5 — Student receives | `/signatura/documents` | My Credentials + Verify link |
| 6 — Employer verifies | `/verify?token=…` | Paste or scan; emphasize plain verdict before technical fields |

**Do not click during live demo:** `/issuer/revocation`, `/issuer/api`, `/issuer/templates`, owner home cards except My Credentials.

---

### Secondary: Mobile verification moment (phone, ~3 min)

1. Student opens **Verify document** on credential
2. Or: `/signatura/documents/scan` → paste token if camera fails
3. Say: “Employer does not need an account”

---

### Tertiary: HOA security story (pre-recorded or appendix only)

1. Only if HavenxSig desktop is running
2. `/hoa-key/remote-unlock/scan` → approve
3. Script: “Phone approves office computer — records stay protected”
4. Do **not** lead with HOA for mixed registrar/clinic audience

---

### Clinic administrators

- Use **`/use-cases/medical-records`** and **`/issuers`** marketing only unless clinic seed is built
- Narrate: verify authenticity **without** exposing the medical file — mirrors verify redaction UI
- Do not improvise patient request flow (no clinic demo seed)

---

## Remaining presentation risks (summary)

| Risk | Severity | Mitigation |
|------|----------|------------|
| Passkey / reverify failure | High | Rehearse; keep two browsers logged in |
| Misleading owner home cards | Medium | Stay on `/signatura/documents` |
| Issuer stub pages in nav | Medium | Never click Revocation/API |
| `/verify` technical output | Medium | Narrate verdict first; hide Merkle in speech |
| HOA / HavenxSig dependency | High | Appendix only |
| Role switcher not on `/` | Medium | Use login/activation paths per `DEMO_SIGNATURA_REQUEST_FLOW.md` |
| HTTP camera block | Medium | HTTPS or paste token |
| Developer placeholders in issue form | High | Use hash field only; never show Prisma ID field |
| Clinic live demo without seed | High | Marketing slides only |

---

## Appendix: Page inventory for screenshot packet

**Include in deck**

- `/` home hero (trust badges)
- `/use-cases/universities`
- `/signatura/documents` — request + credentials
- `/issuer/requests` — inbox + approve
- `/verify` — result card
- `/signatura/documents/scan` — mobile frame
- `/issuer` dashboard

**Exclude from deck**

- `/issuer/revocation`, `/issuer/api`, `/issuer/audit`, `/issuer/bulk-upload`
- `/hoa-key/*` (unless HOA-specific audience)
- Raw API paths and enum labels

---

*This review is presentation-focused. Backend demo seeding and verify API behavior are documented in `docs/DEMO_SIGNATURA_REQUEST_FLOW.md` and `docs/DEMO_READINESS_REPORT.md`.*
