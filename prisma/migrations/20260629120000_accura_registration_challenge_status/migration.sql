ALTER TABLE "accura_registration_handoffs"
	ADD COLUMN IF NOT EXISTS "challenge_id" TEXT,
	ADD COLUMN IF NOT EXISTS "origin_device" TEXT NOT NULL DEFAULT 'desktop',
	ADD COLUMN IF NOT EXISTS "flow_type" TEXT NOT NULL DEFAULT 'cross_device_qr',
	ADD COLUMN IF NOT EXISTS "verification_token" TEXT,
	ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "accura_registration_handoffs_challenge_id_idx"
	ON "accura_registration_handoffs"("challenge_id");
