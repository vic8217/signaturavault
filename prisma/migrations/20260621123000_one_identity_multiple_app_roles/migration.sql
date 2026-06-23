DROP INDEX IF EXISTS "signatura_app_links_signatura_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "signatura_app_links_user_id_source_app_company_id_role_prefix_key"
	ON "signatura_app_links"("user_id", "source_app", "company_id", "role_prefix");
