ALTER TABLE "trusted_device_login_challenges"
ADD COLUMN "return_url" TEXT,
ADD COLUMN "expected_signatura_id" TEXT,
ADD COLUMN "role_prefix" TEXT,
ADD COLUMN "state" TEXT;

CREATE INDEX "trusted_device_login_challenges_client_id_status_idx"
ON "trusted_device_login_challenges"("client_id", "status");

CREATE INDEX "trusted_device_login_challenges_source_app_status_idx"
ON "trusted_device_login_challenges"("source_app", "status");

CREATE INDEX "trusted_device_login_challenges_expected_signatura_id_idx"
ON "trusted_device_login_challenges"("expected_signatura_id");
