This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Signatura Issuer Portal & API

This workspace now includes a tenant-aware issuer portal and issuer API architecture for Signatura.

- Issuer tenant registration and onboarding
- Issuer admin dashboard and template setup
- Manual issuance and bulk upload support
- QR generation and verification token lifecycle
- API key / OAuth client-like issuer API credential creation
- Document registration, hash submission, revocation, and verification endpoints
- Webhook registration and signed webhook support
- Audit logs, API logs, and tenant isolation via `tenant_id`

### New data model support

The solution includes a Prisma/PostgreSQL schema for:

- `tenants`
- `issuers`
- `issuer_users`
- `issuer_api_clients`
- `issuer_api_keys`
- `document_types`
- `document_templates`
- `document_records`
- `verification_tokens`
- `storage_connections`
- `blockchain_anchors`
- `webhooks`
- `api_logs`
- `audit_logs`

### PostgreSQL setup

Prisma is configured in `prisma/schema.prisma` and reads `DATABASE_URL` from the
project root `.env` through `prisma.config.ts`.

```bash
npm run db:generate
npm run db:migrate
npm run db:studio
```

For local development, set:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/signatura?schema=public"
SESSION_SECRET="replace-with-a-long-random-session-secret"
RECOVERY_CODE_SECRET="replace-with-a-long-random-recovery-code-secret"
ACTIVATION_TOKEN_SECRET="replace-with-a-long-random-activation-token-secret"
```

If you already have a PostgreSQL database, replace the value with that
connection string before running `npm run db:migrate`.

### Protected issuer presentation deck

The invited-viewer deck is available at:

```text
/presentation/signatura-issuers?token=...
```

Access links are server-validated against `presentation_access_links`. Tokens are
generated with secure random bytes and only token hashes are stored. Successful
views are recorded in `presentation_access_views` with timestamp, IP address
when available, and user agent when available.

Admin management:

```text
/admin/presentations/signatura-issuers
```

Local setup:

```bash
npm run db:migrate
npm run db:generate
npm run demo:presentation-token
```

If the local database user cannot create Prisma shadow databases, apply checked-in
migrations with:

```bash
npx prisma migrate deploy
```

The slide PNGs live in:

```text
public/presentations/signatura-issuers/
```

Replace the placeholder files with final 4:3 PNG exports using the exact names:

```text
slide-01.png
slide-02.png
...
slide-15.png
```

Keep the files as PNGs. The viewer expects 15 slides and displays one slide at a
time with previous/next controls, fullscreen support, keyboard navigation, and
right-click disabled on the slide image.

### Passkey authentication

The user security flow uses WebAuthn/passkeys through `@simplewebauthn/server`
and `@simplewebauthn/browser`.

Owner portal routes:

- `GET /signatura/dashboard`
- `GET /signatura/documents`
- `GET /signatura/trusted-devices`
- `GET /signatura/trusted-devices/add`
- `GET /signatura/trusted-devices/add-passkey`
- `GET /signatura/settings`
- `GET /signatura/settings/security`
- `GET /signatura/settings/recovery-codes`

Issuer portal routes:

- `GET /issuer`
- `GET /issuer/onboarding`
- `GET /issuer/activate`
- `GET /login?next=/issuer`
- `GET /register`

Legacy `/wallet/*`, `/security/*`, and `/issuer-portal/*` URLs redirect to the
canonical `/signatura/*` and `/issuer/*` routes during the migration soak period.

Signatura never receives or stores fingerprint or face data. The device keeps
biometrics locally and the app stores only credential IDs, public keys, counters,
trusted-device metadata, recovery-code hashes, and security event logs.

Issuer onboarding invitations support Viber, Messenger, WhatsApp, SMS, and
secure enterprise channels as delivery channels only. Activation links are
single-use, expiring, and stored hashed. Activation still requires registering a
trusted device with WebAuthn/passkey security.

### API routes

- `POST /api/issuers/register`
- `GET /api/issuers/[tenantId]/api-clients`
- `POST /api/issuers/[tenantId]/api-clients`
- `POST /api/issuers/[tenantId]/documents`
- `POST /api/issuers/[tenantId]/hashes`
- `POST /api/issuers/[tenantId]/qr`
- `POST /api/issuers/[tenantId]/revoke`
- `GET /api/issuers/[tenantId]/verify?token=...`
- `GET /api/issuers/[tenantId]/webhooks`
- `POST /api/issuers/[tenantId]/webhooks`

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
