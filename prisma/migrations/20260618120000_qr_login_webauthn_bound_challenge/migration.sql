ALTER TABLE "trusted_device_login_challenges" ADD COLUMN "nonce" TEXT;

UPDATE "trusted_device_login_challenges"
SET "nonce" = md5(random()::text || clock_timestamp()::text || "id")
WHERE "nonce" IS NULL;

ALTER TABLE "trusted_device_login_challenges" ALTER COLUMN "nonce" SET NOT NULL;
