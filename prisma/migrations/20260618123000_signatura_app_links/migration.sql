CREATE TABLE "signatura_app_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "signatura_id" TEXT NOT NULL,
    "source_app" TEXT NOT NULL,
    "company_code" TEXT,
    "company_name" TEXT,
    "role" TEXT,
    "role_prefix" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signatura_app_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "signatura_app_links_user_id_idx" ON "signatura_app_links"("user_id");
CREATE UNIQUE INDEX "signatura_app_links_signatura_id_key" ON "signatura_app_links"("signatura_id");
CREATE INDEX "signatura_app_links_source_app_company_code_role_prefix_idx" ON "signatura_app_links"("source_app", "company_code", "role_prefix");
CREATE UNIQUE INDEX "signatura_app_links_source_app_company_code_role_prefix_signatura_id_key" ON "signatura_app_links"("source_app", "company_code", "role_prefix", "signatura_id");

ALTER TABLE "signatura_app_links" ADD CONSTRAINT "signatura_app_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
