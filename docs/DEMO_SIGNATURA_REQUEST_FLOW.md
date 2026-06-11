# Signatura Demo — Document Request Flow

End-to-end demo for owner document requests: request → issuer review → issue → wallet credential → public verify.

## Quick start

```bash
npm install
npx prisma migrate deploy   # or: npx prisma migrate dev
npm run demo:seed-signatura
npm run dev:lan:https       # HTTPS recommended for passkeys / camera QR
```

**Full database wipe (optional):**

```bash
SEED_RESET=1 npm run demo:seed-signatura
```

Default demo seed **preserves** existing users, sessions, and passkeys.

---

## What `demo:seed-signatura` prepares

| Item | Value |
|------|-------|
| Tenant | `tenant_request_demo` — Request Demo University |
| Issuer | `issuer_request_demo`, `acceptsRequests: true` |
| Document type | **Official Transcript** (published template) |
| Tenant key | Active `PrivateFieldKeyReference` (`ztpf_tenant_request_demo_1_demoseedkey`) |
| Staff invite | Pre-seeded activation link (see below) |

After seed, the console prints the staff activation path.

**Demo staff activation URL (development default):**

```
/issuer/activate?token=demo-signatura-staff-activation-token-dev-only
```

Override the token with `DEMO_STAFF_ACTIVATION_TOKEN` in `.env` if needed.

---

## Accounts you need

| Persona | How to create | Portal role |
|---------|---------------|-------------|
| **Document owner** | `/register` → passkey | `DOCUMENT_OWNER` (home → Portal access) |
| **Issuer staff** | Activate pre-seeded invite → passkey | `ISSUER_STAFF` |
| **Platform admin** (optional) | `/register` → passkey | `SIGNATURA_ADMIN` |

Role cookies are set via home page **Portal access** buttons in development (`POST /api/auth/session`). You must also have a real passkey session (`signatura_session`).

---

## Step 1 — Owner registration

1. Open `/register`
2. Register a passkey (creates user + trusted device)
3. On the home page, click **Document Owner** under Portal access
4. Open `/signatura/documents`

**Expected:** My Documents page loads; **Request Demo University** appears in the issuer list after seed.

---

## Step 2 — Issuer staff setup

1. Open the activation URL printed by `npm run demo:seed-signatura`
   - Example: `http://localhost:3000/issuer/activate?token=demo-signatura-staff-activation-token-dev-only`
2. Complete passkey registration on the activation page
3. On the home page, click **Issuer Staff** under Portal access
4. Open `/issuer/requests`

**Expected:** Request inbox loads without `403 Active issuer account required`.

Re-running `npm run demo:seed-signatura` skips staff invite creation once staff is activated.

---

## Step 3 — Owner requests a document

**URL:** `/signatura/documents`

1. Click **Request Digital Copy**
2. Issuer: **Request Demo University**
3. Document type: **Official Transcript**
4. Purpose: `Graduate school application`
5. Student number: `STU-2026-0042`
6. Click **Submit request** → approve passkey reverify when prompted

**Expected:**

- Request appears with status **Pending**
- Detail message: *"Your request is waiting for issuer review."*
- No amber “issuer not ready” warning (tenant key is seeded)

---

## Step 4 — Issuer approves the request

**URL:** `/issuer/requests` (as issuer staff)

1. Filter **Pending**, select the request
2. Confirm decrypted **Purpose** and **Student number** are visible
3. Click **Approve**

**Expected:** Status becomes **Approved**. Owner sees *"Your request was approved…"*

**Alternate — Deny:** Enter a denial reason and click **Deny**. Owner sees the reason in request detail.

---

## Step 5 — Issuer marks document issued

**Precondition:** Request status is **Approved**

1. In **Mark issued**, enter document hash:
   ```
   sha256:demo-transcript-2026-0042-deadbeefcafe
   ```
2. Check **Deliver to owner Signatura wallet**
3. Click **Mark issued**

**Expected:** Status **Issued**; owner detail says wallet delivery is available.

---

## Step 6 — Owner sees credential

**URL:** `/signatura/documents` (owner session)

**Expected in My Credentials:**

- Official Transcript from Request Demo University
- Issued timestamp, verification status, anchor status
- **Verify document** link (`/verify?token=…`)

---

## Step 7 — Public verify

Anyone (no login):

1. Open the **Verify document** link from My Credentials, or
2. Scan/paste a QR token at `/signatura/documents/scan` or `/wallet/scan`, or
3. Open `/verify` and paste the token

**Expected on `/verify`:**

- Redacted verification result card
- `token_valid: true`
- Document status (e.g. `valid`)
- Anchor status, issued date, document ID
- Private fields noted as redacted

**API equivalent:**

```bash
curl -s "http://localhost:3000/api/verify/VER-XXXXXXXX" | jq .
```

---

## Demo hash reference

Use this hash when marking a request issued with wallet delivery:

```
sha256:demo-transcript-2026-0042-deadbeefcafe
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Issuer not in request list | Run `npm run demo:seed-signatura` |
| “Issuer not ready for secure document requests” | Re-run demo seed (creates tenant keyRef) |
| Submit fails after idle | Passkey reverify expires in 5 minutes — retry submit |
| `/issuer/requests` → 403 | Complete staff activation; set `ISSUER_STAFF` role cookie |
| Verify page shows error | Confirm document was issued with hash; token must match issued record |
| Need clean slate | `SEED_RESET=1 npm run demo:seed-signatura` (wipes all users) |

---

## Route map

| Step | URL |
|------|-----|
| Demo seed | `npm run demo:seed-signatura` |
| Owner documents | `/signatura/documents` |
| Issuer inbox | `/issuer/requests` |
| Staff activation | `/issuer/activate?token=…` |
| QR scan | `/signatura/documents/scan` |
| Public verify | `/verify` or `/verify?token=…` |
| Verify API | `GET /api/verify/[token]` |
