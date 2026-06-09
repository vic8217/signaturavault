ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signatura_id" TEXT;
UPDATE "users"
SET "signatura_id" = 'SIG-' || upper(substr(md5("id"), 1, 8))
WHERE "signatura_id" IS NULL OR "signatura_id" = '';
ALTER TABLE "users" ALTER COLUMN "signatura_id" SET NOT NULL;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_lookup_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mobile_lookup_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "account_status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "trust_level" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_signatura_id_key" ON "users"("signatura_id");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lookup_hash_key" ON "users"("email_lookup_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "users_mobile_lookup_hash_key" ON "users"("mobile_lookup_hash");

UPDATE "users" SET "email" = NULL, "name" = NULL;

UPDATE "issuers"
SET "contact_email" = NULL,
    "address" = NULL,
    "registration_number" = NULL;

UPDATE "issuer_users"
SET "email" = "id" || '@hidden.signatura.local';

UPDATE "issuer_invitations"
SET "email" = "id" || '@hidden.signatura.local',
    "recipient" = '[hidden]';

UPDATE "document_records"
SET "external_id" = "id",
    "recipient_name" = '[hidden]',
    "metadata" = NULL;
