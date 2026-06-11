CREATE TABLE "trusted_device_login_challenges" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "short_code" TEXT NOT NULL,
    "browser_secret_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "approval_token_hash" TEXT,
    "approving_device_id" TEXT,
    "approving_credential_id" TEXT,
    "browser_user_agent" TEXT,
    "next_path" TEXT,
    "approved_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trusted_device_login_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "trusted_device_login_challenges_short_code_status_idx" ON "trusted_device_login_challenges"("short_code", "status");
CREATE INDEX "trusted_device_login_challenges_user_id_status_idx" ON "trusted_device_login_challenges"("user_id", "status");
CREATE INDEX "trusted_device_login_challenges_expires_at_idx" ON "trusted_device_login_challenges"("expires_at");

ALTER TABLE "trusted_device_login_challenges" ADD CONSTRAINT "trusted_device_login_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
