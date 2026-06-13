# Test Process: HavenxSig + Signatura Integration

Manual test script for **Signatura ID creation**, **HOA encryption key enrollment**, and **remote unlock** between HavenxSig and Signatura.

**Related docs**

- School document-request demo (separate flow): [`DEMO_SIGNATURA_REQUEST_FLOW.md`](DEMO_SIGNATURA_REQUEST_FLOW.md)
- HavenxSig role-by-role UX: `../havenxsig/docs/UX_TEST_WALKTHROUGH.md`
- HOA key product flow: `../havenxsig/docs/HOA_ENCRYPTION_KEY_UX_FLOW.md`

---

## What this tests

| Step | Product behavior |
|------|------------------|
| 1 | User creates a **Signatura ID** (`SIG-…`) with passkey + trusted device |
| 2 | HOA admin **enrolls** a community encryption key in Signatura (key reference only stored server-side) |
| 3 | Desktop HavenxSig starts **Unlock with Signatura** → QR + short code |
| 4 | Phone Signatura **approves** remote unlock with passkey |
| 5 | HavenxSig decrypts private resident data for ~15 minutes in that browser tab |

**Out of scope for this script:** school transcript requests (`demo:seed-signatura`), JSON retirement, production deployment.

---

## Prerequisites

### Repos and ports

| App | Path | Default URL |
|-----|------|-------------|
| Signatura | `signaturavaultv1` | `http://localhost:3000` |
| HavenxSig | `havenxsig` (sibling repo) | `http://localhost:3001` |

### Databases

- Signatura: PostgreSQL (`DATABASE_URL` in `signaturavaultv1/.env`)
- HavenxSig: PostgreSQL (`DATABASE_URL` in `havenxsig/.env.local`)

### Browsers / devices

- **Desktop browser** — HavenxSig HOA admin + optional Signatura setup
- **Phone or second browser profile** — Signatura with the **same** account for remote unlock approval
- **HTTPS recommended** for camera QR (`npm run dev:lan:https` on both apps if testing scan on a physical phone)

### Environment alignment

Secrets and URLs must match between apps.

**Signatura** (`signaturavaultv1/.env`):

```bash
HAVENXSIG_CALLBACK_URL=http://localhost:3001/auth/callback
HAVENXSIG_ORIGIN=http://localhost:3001
HAVENXSIG_CLIENT_SECRET=<shared-secret>
```

**HavenxSig** (`havenxsig/.env.local`):

```bash
SIGNATURA_API_URL=http://localhost:3000
SIGNATURA_CALLBACK_URL=http://localhost:3001/auth/callback
SIGNATURA_CLIENT_SECRET=<same shared-secret>
NEXT_PUBLIC_SIGNATURA_LOGIN_URL=http://localhost:3000/api/oauth/authorize
NEXT_PUBLIC_HAVENXSIG_URL=http://localhost:3001
```

For **real** integration testing, leave `SIGNATURA_ZERO_TRUST_MOCK_ALLOW` **unset** in HavenxSig.

Run preflight:

```bash
cd signaturavaultv1
npm run check:hoa-signatura-dev
```

---

## Choose a starting dataset

### Option A — Greenview demo HOA (fastest)

Pre-seeded community with issued-credential logins.

```bash
cd havenxsig
npm run seed:demo-hoa
```

| Field | Value |
|-------|-------|
| HOA name | Greenview Heights HOA |
| System code | `GV-2026-HAVEN` |
| HOA admin portal | `http://localhost:3001/login/hoa-admin` |
| Username | `admin.greenview` |
| Password | `Temp#GV4821` |

Also seed Signatura OAuth client (if not already):

```bash
cd signaturavaultv1
npx prisma db seed
```

### Option B — Clean platform reset (custom HOA)

Wipes both databases; only dev admin remains.

```bash
cd signaturavaultv1
npm run reset:dev
```

Then:

1. HavenxSig: `http://localhost:3001/login/dev-admin` — `dev_admin` / `devadmin_password`
2. Create HOA: `http://localhost:3001/platform/register`
3. Log in as the new HOA admin you create

---

## Start servers

**Terminal 1 — Signatura**

```bash
cd signaturavaultv1
npm run dev
# or: npm run dev:lan:https  (for phone camera / LAN)
```

**Terminal 2 — HavenxSig**

```bash
cd havenxsig
npm run dev
# or: npm run dev:lan:https
```

Confirm preflight passes: `npm run check:hoa-signatura-dev` (from Signatura repo).

---

## Test process

### Phase 1 — Create Signatura ID

**Goal:** Active Signatura user with passkey and trusted device.

| Step | Action | Expected |
|------|--------|----------|
| 1.1 | Open `http://localhost:3000/register` | Registration form loads |
| 1.2 | Enter name, email, handphone; continue | Passkey registration prompt |
| 1.3 | Complete passkey / biometric | Account created; recovery phrase shown once |
| 1.4 | Note your **Signatura ID** (`SIG-…`) | Visible on dashboard or `/login` |
| 1.5 | Open `http://localhost:3000/signatura/trusted-devices` | At least one trusted device listed |

**Alternate — OAuth from HavenxSig**

| Step | Action | Expected |
|------|--------|----------|
| 1.A1 | HavenxSig `http://localhost:3001/login/hoa-admin` | Login page with **Continue with Signatura** |
| 1.A2 | Click **Continue with Signatura** | Redirect to Signatura OAuth |
| 1.A3 | If no passkey: use **Create account** in passkey card | Register, then OAuth continues |
| 1.A4 | Approve OAuth consent / passkey | Redirect to `http://localhost:3001/auth/callback` → HOA dashboard |

**Pass:** You can sign in to Signatura and HavenxSig (issued credentials or Signatura SSO).

---

### Phase 2 — Enroll HOA encryption key (one-time)

**Goal:** `PrivateFieldKeyReference` exists in Signatura for the HOA tenant; key saved in device vault on the enrolling device.

| Step | Action | Expected |
|------|--------|----------|
| 2.1 | Log into HavenxSig as **HOA admin** (not dev-admin) | Dashboard with Zero Trust panel |
| 2.2 | Open encrypted workflow, e.g. `http://localhost:3001/admin/homeowners` | Red panel: *HOA encryption key required* |
| 2.3 | Click **Set up HOA key** | Redirect to Signatura `/hoa-key/setup?tenantId=…&hoaId=…` |
| 2.4 | Sign in to Signatura if prompted (same user as Phase 1) | HOA key setup form |
| 2.5 | Click **Generate key**; reveal and **copy** key (demo vault) | Key field populated |
| 2.6 | Check both confirmation boxes | Enroll button enabled |
| 2.7 | Click **Enroll key reference** | Passkey reverify if asked |
| 2.8 | Wait for success message | *Key reference enrolled…*; redirect back to HavenxSig or instruction to return |

**Pass:** HavenxSig **Set up HOA key** no longer required; unlock panel shows **Unlock with Signatura**.

**Fail signals**

| Message | Fix |
|---------|-----|
| Authentication required | Log into Signatura first |
| Recent passkey verification required | Click **Verify with passkey** on setup page |
| Unable to enroll HOA key | Check `SIGNATURA_API_URL`, shared secret, Signatura logs |

**Important:** Enroll on the **phone** you will use for remote unlock, or enroll again on that device later.

---

### Phase 3 — Remote unlock (desktop → phone)

**Goal:** HavenxSig browser session receives HOA key for ~15 minutes.

**Desktop (HavenxSig)**

| Step | Action | Expected |
|------|--------|----------|
| 3.1 | HOA admin dashboard or `/admin/homeowners` | Zero Trust panel visible |
| 3.2 | Click **Unlock with Signatura** | QR code + short code (e.g. `AB12CD`) |
| 3.3 | Leave page open | Status *Waiting for approval (PENDING)…* |

**Phone (Signatura — same `SIG-…` account)**

| Step | Action | Expected |
|------|--------|----------|
| 3.4 | Open scanner: `http://localhost:3000/hoa-key/remote-unlock/scan` | Camera / paste form |
| 3.5 | Scan QR **or** open link / paste challenge URL | Remote unlock approve page |
| 3.6 | Click **Approve with passkey** | Passkey prompt |
| 3.7 | Approve | *Browser session authorized…* |

**Desktop (HavenxSig)**

| Step | Action | Expected |
|------|--------|----------|
| 3.8 | Panel turns green | *Protected by HOA-Controlled Zero Trust Encryption* |
| 3.9 | Refresh `/admin/homeowners` | Previously redacted fields decrypt (if pending registrations exist) |

**Pass:** Green unlock panel; encrypted homeowner fields readable after refresh.

**Fail signals**

| Message | Fix |
|---------|-----|
| This device does not have the current HOA encryption key | Run Phase 2 on this phone |
| Use the same Signatura account (SIG-…) on your phone | Match accounts across devices |
| Remote unlock expired | Start again from 3.2 |
| Unlock challenge not found | Check both servers running; secrets aligned |

---

### Phase 4 — Encrypted data workflow (smoke test)

**Goal:** Prove unlock gates read/write of private HOA data.

| Step | Action | Expected |
|------|--------|----------|
| 4.1 | With panel **locked**, try saving on an encrypted form | Blocked — HOA key required / HTTP 428 |
| 4.2 | Complete Phase 3 unlock | Panel green |
| 4.3 | `/admin/homeowners` — view pending registration | Contact / details visible |
| 4.4 | Approve or deny a registration (if seed data present) | Action succeeds; audit logged |
| 4.5 | Close browser tab, reopen HavenxSig | Unlock cleared — must unlock again |

**Pass:** Save/view blocked without unlock; succeeds with unlock; session clears on tab close.

---

### Phase 5 — OAuth session persistence (optional)

| Step | Action | Expected |
|------|--------|----------|
| 5.1 | Log out HavenxSig; **Continue with Signatura** again | OAuth completes without new registration |
| 5.2 | HavenxSig calls Signatura `GET /api/users/me` with stored Bearer token | Identity resolves (no mock) |

---

## Quick reference URLs

| Purpose | URL |
|---------|-----|
| Signatura register | `http://localhost:3000/register` |
| Signatura login | `http://localhost:3000/login` |
| Trusted devices | `http://localhost:3000/signatura/trusted-devices` |
| HOA key setup | `http://localhost:3000/hoa-key/setup?tenantId=<hoaId>&hoaId=<hoaId>` |
| Remote unlock approve | `http://localhost:3000/hoa-key/remote-unlock?cid=…&code=…` |
| Remote unlock scan | `http://localhost:3000/hoa-key/remote-unlock/scan` |
| HavenxSig HOA admin | `http://localhost:3001/login/hoa-admin` |
| HavenxSig homeowners | `http://localhost:3001/admin/homeowners` |
| HavenxSig dev admin | `http://localhost:3001/login/dev-admin` |

Replace `<hoaId>` with the tenant UUID from HavenxSig (admin settings or database). The **Set up HOA key** link fills this automatically.

---

## Test modes

| Mode | HavenxSig env | Use when |
|------|---------------|----------|
| **Full integration** | `SIGNATURA_ZERO_TRUST_MOCK_ALLOW` unset | Testing Signatura ID, enroll, unlock, OAuth |
| **HavenxSig UI only** | `SIGNATURA_ZERO_TRUST_MOCK_ALLOW=true` | HOA screens without Signatura running |
| **Issued credentials only** | Signatura optional | Role UX without SSO or unlock |

---

## Automated checks

```bash
# Preflight only (env + HTTP reachability)
cd signaturavaultv1
npm run check:hoa-signatura-dev

# Signatura unit/integration tests
npm test

# HavenxSig tests
cd ../havenxsig
npm test
```

---

## Troubleshooting matrix

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| OAuth redirect fails | Callback / secret mismatch | Align `HAVENXSIG_*` and `SIGNATURA_*` secrets |
| 403 on zero-trust API | Mock off, Signatura down | Start Signatura; check `SIGNATURA_API_URL` |
| No passkey on login | Fresh Signatura DB | `/register` again |
| Setup link 401 | No Signatura session | Log in before `/hoa-key/setup` |
| Phone approve fails | Wrong account or no vault key | Same `SIG-…`; re-enroll on phone |
| QR camera blocked | HTTP origin | Use `dev:lan:https` or paste short code |
| Greenview login fails | Demo seed not run | `cd havenxsig && npm run seed:demo-hoa` |
| Encrypted fields stay redacted | Unlock expired / wrong key | Re-unlock; same HOA key as enrollment |

---

## Sign-off checklist

- [ ] Preflight script passes
- [ ] Signatura ID created with trusted device
- [ ] HOA key enrolled via `/hoa-key/setup`
- [ ] Remote unlock: desktop QR → phone approve → green panel
- [ ] Encrypted homeowner data visible after unlock
- [ ] Save blocked when locked
- [ ] (Optional) HavenxSig **Continue with Signatura** OAuth works

---

## Estimated time

| Path | Duration |
|------|----------|
| First-time (install, seed, register, enroll, unlock) | 30–45 min |
| Repeat run (same devices, seeded HOA) | 10–15 min |
| Greenview demo HOA + existing passkeys | 5–10 min |
