CREATE TABLE "authenticator_applications" (
  "id" TEXT NOT NULL, "application_id" TEXT NOT NULL, "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active', "require_biometric" BOOLEAN NOT NULL DEFAULT false,
  "client_secret_hash" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "authenticator_applications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "authenticator_applications_application_id_key" ON "authenticator_applications"("application_id");
CREATE TABLE "authenticator_enrollments" (
  "id" TEXT NOT NULL, "application_id" TEXT NOT NULL, "identity_id" TEXT NOT NULL,
  "secret_ciphertext" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'active', CONSTRAINT "authenticator_enrollments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "authenticator_enrollments_application_id_identity_id_key" ON "authenticator_enrollments"("application_id", "identity_id");
CREATE INDEX "authenticator_enrollments_identity_id_status_idx" ON "authenticator_enrollments"("identity_id", "status");
CREATE TABLE "authenticator_challenges" (
  "id" TEXT NOT NULL, "token_hash" TEXT NOT NULL, "application_id" TEXT NOT NULL,
  "identity_id" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMP(3) NOT NULL, "verified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "authenticator_challenges_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "authenticator_challenges_token_hash_key" ON "authenticator_challenges"("token_hash");
CREATE INDEX "authenticator_challenges_application_id_identity_id_status_idx" ON "authenticator_challenges"("application_id", "identity_id", "status");
CREATE INDEX "authenticator_challenges_expires_at_idx" ON "authenticator_challenges"("expires_at");
ALTER TABLE "authenticator_enrollments" ADD CONSTRAINT "authenticator_enrollments_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "authenticator_applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "authenticator_enrollments" ADD CONSTRAINT "authenticator_enrollments_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "authenticator_challenges" ADD CONSTRAINT "authenticator_challenges_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "authenticator_applications"("application_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "authenticator_challenges" ADD CONSTRAINT "authenticator_challenges_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "authenticator_applications" ("id", "application_id", "name", "status", "require_biometric", "created_at", "updated_at") VALUES ('auth_app_accura', 'accura-erp', 'ACCURA ERP', 'active', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
