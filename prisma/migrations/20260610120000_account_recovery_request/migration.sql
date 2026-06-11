CREATE TABLE "account_recovery_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "signatura_id" TEXT,
    "email_lookup_hash" TEXT,
    "mobile_lookup_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "cooldown_until" TIMESTAMP(3),
    "liveness_status" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_recovery_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "account_recovery_requests_signatura_id_idx" ON "account_recovery_requests"("signatura_id");
CREATE INDEX "account_recovery_requests_email_lookup_hash_idx" ON "account_recovery_requests"("email_lookup_hash");
CREATE INDEX "account_recovery_requests_mobile_lookup_hash_idx" ON "account_recovery_requests"("mobile_lookup_hash");
CREATE INDEX "account_recovery_requests_status_idx" ON "account_recovery_requests"("status");
CREATE INDEX "account_recovery_requests_cooldown_until_idx" ON "account_recovery_requests"("cooldown_until");

ALTER TABLE "account_recovery_requests" ADD CONSTRAINT "account_recovery_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
