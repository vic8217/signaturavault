CREATE TABLE IF NOT EXISTS "issuer_authorization_codes" (
    "id" TEXT NOT NULL,
    "issuer_id" TEXT,
    "tenant_id" TEXT,
    "code_hash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issuer_authorization_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "issuer_authorization_codes_code_hash_key"
    ON "issuer_authorization_codes"("code_hash");

CREATE INDEX IF NOT EXISTS "issuer_authorization_codes_issuer_id_idx"
    ON "issuer_authorization_codes"("issuer_id");

CREATE INDEX IF NOT EXISTS "issuer_authorization_codes_tenant_id_idx"
    ON "issuer_authorization_codes"("tenant_id");

CREATE INDEX IF NOT EXISTS "issuer_authorization_codes_status_expires_at_idx"
    ON "issuer_authorization_codes"("status", "expires_at");
