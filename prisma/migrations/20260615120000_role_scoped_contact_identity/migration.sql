DROP INDEX IF EXISTS "users_email_lookup_hash_key";
DROP INDEX IF EXISTS "users_mobile_lookup_hash_key";

CREATE INDEX IF NOT EXISTS "users_email_lookup_hash_idx" ON "users"("email_lookup_hash");
CREATE INDEX IF NOT EXISTS "users_mobile_lookup_hash_idx" ON "users"("mobile_lookup_hash");
