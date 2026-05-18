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

The solution includes lightweight table design for:

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
