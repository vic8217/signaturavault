CREATE TABLE "admin_setup_tokens" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'ADMIN_PASSKEY_SETUP',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "user_agent" TEXT,
    "ip_hash" TEXT,

    CONSTRAINT "admin_setup_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_setup_tokens_token_hash_key" ON "admin_setup_tokens"("token_hash");
CREATE INDEX "admin_setup_tokens_user_id_status_idx" ON "admin_setup_tokens"("user_id", "status");
CREATE INDEX "admin_setup_tokens_expires_at_idx" ON "admin_setup_tokens"("expires_at");
CREATE INDEX "admin_setup_tokens_purpose_idx" ON "admin_setup_tokens"("purpose");

ALTER TABLE "admin_setup_tokens" ADD CONSTRAINT "admin_setup_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
