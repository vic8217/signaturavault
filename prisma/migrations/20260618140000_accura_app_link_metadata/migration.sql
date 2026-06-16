ALTER TABLE "signatura_app_links"
	ADD COLUMN IF NOT EXISTS "company_id" TEXT,
	ADD COLUMN IF NOT EXISTS "tenant_id" TEXT,
	ADD COLUMN IF NOT EXISTS "accura_user_id" TEXT,
	ADD COLUMN IF NOT EXISTS "accura_module_access" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
	ADD COLUMN IF NOT EXISTS "accura_permission_set" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
	ADD COLUMN IF NOT EXISTS "registration_context" JSONB,
	ADD COLUMN IF NOT EXISTS "trusted_device_status" TEXT;

CREATE INDEX IF NOT EXISTS "signatura_app_links_source_app_company_id_role_prefix_idx"
	ON "signatura_app_links"("source_app", "company_id", "role_prefix");

CREATE INDEX IF NOT EXISTS "signatura_app_links_source_app_tenant_id_idx"
	ON "signatura_app_links"("source_app", "tenant_id");

CREATE INDEX IF NOT EXISTS "signatura_app_links_accura_user_id_idx"
	ON "signatura_app_links"("accura_user_id");
