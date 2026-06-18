CREATE TABLE IF NOT EXISTS "accura_registration_handoffs" (
	"id" TEXT PRIMARY KEY,
	"token_id" TEXT NOT NULL,
	"registration_key_id" TEXT NOT NULL,
	"company_id" TEXT NOT NULL,
	"company_code" TEXT NOT NULL,
	"role_code" TEXT NOT NULL,
	"return_url" TEXT NOT NULL,
	"status" TEXT NOT NULL DEFAULT 'CLAIMED',
	"user_id" TEXT,
	"signatura_id" TEXT,
	"expires_at" TIMESTAMP(3) NOT NULL,
	"claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	"completed_at" TIMESTAMP(3),
	"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "accura_registration_handoffs_token_id_key"
	ON "accura_registration_handoffs"("token_id");

CREATE INDEX IF NOT EXISTS "accura_registration_handoffs_registration_key_id_idx"
	ON "accura_registration_handoffs"("registration_key_id");

CREATE INDEX IF NOT EXISTS "accura_registration_handoffs_company_id_role_code_idx"
	ON "accura_registration_handoffs"("company_id", "role_code");

CREATE INDEX IF NOT EXISTS "accura_registration_handoffs_status_idx"
	ON "accura_registration_handoffs"("status");

CREATE INDEX IF NOT EXISTS "accura_registration_handoffs_expires_at_idx"
	ON "accura_registration_handoffs"("expires_at");
