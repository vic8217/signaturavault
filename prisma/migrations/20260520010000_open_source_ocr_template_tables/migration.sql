CREATE TABLE IF NOT EXISTS "template_fields" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "field_label" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "field_type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "public_visible" BOOLEAN NOT NULL DEFAULT false,
    "searchable" BOOLEAN NOT NULL DEFAULT false,
    "validation_rule" TEXT,
    "default_value" TEXT,
    "options_json" JSONB,
    "x_position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "y_position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "page_number" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_fields_pkey" PRIMARY KEY ("id")
);

INSERT INTO "template_fields" (
    "id",
    "template_id",
    "field_label",
    "field_key",
    "field_type",
    "required",
    "encrypted",
    "public_visible",
    "searchable",
    "validation_rule",
    "default_value",
    "options_json",
    "x_position",
    "y_position",
    "width",
    "height",
    "page_number",
    "sort_order",
    "created_at",
    "updated_at"
)
SELECT
    "id",
    "template_id",
    "field_label",
    "field_key",
    "field_type",
    "required",
    "encrypted",
    "public_visible",
    "searchable",
    "validation_rule",
    "default_value",
    "options_json",
    "x_position",
    "y_position",
    "width",
    "height",
    "page_number",
    "sort_order",
    "created_at",
    "updated_at"
FROM "document_template_fields"
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "template_versions" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "schema_json" JSONB,
    "fields_json" JSONB,
    "template_hash" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "template_fields_template_id_idx" ON "template_fields"("template_id");
CREATE INDEX IF NOT EXISTS "template_fields_field_key_idx" ON "template_fields"("field_key");
CREATE INDEX IF NOT EXISTS "template_versions_template_id_idx" ON "template_versions"("template_id");
CREATE INDEX IF NOT EXISTS "template_versions_version_idx" ON "template_versions"("version");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'template_fields_template_id_fkey'
    ) THEN
        ALTER TABLE "template_fields"
        ADD CONSTRAINT "template_fields_template_id_fkey"
        FOREIGN KEY ("template_id") REFERENCES "document_templates"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'template_versions_template_id_fkey'
    ) THEN
        ALTER TABLE "template_versions"
        ADD CONSTRAINT "template_versions_template_id_fkey"
        FOREIGN KEY ("template_id") REFERENCES "document_templates"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
