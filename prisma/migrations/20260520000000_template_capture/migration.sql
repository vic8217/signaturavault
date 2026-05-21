ALTER TABLE "document_templates"
ADD COLUMN IF NOT EXISTS "issuer_id" TEXT,
ADD COLUMN IF NOT EXISTS "document_type" TEXT,
ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS "original_file_url" TEXT,
ADD COLUMN IF NOT EXISTS "preview_image_url" TEXT,
ADD COLUMN IF NOT EXISTS "created_by" TEXT,
ADD COLUMN IF NOT EXISTS "published_by" TEXT,
ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "source_template_id" TEXT;

CREATE TABLE IF NOT EXISTS "document_template_fields" (
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

    CONSTRAINT "document_template_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "template_extraction_logs" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "extraction_status" TEXT NOT NULL,
    "ocr_provider" TEXT,
    "raw_ocr_json" JSONB,
    "ai_suggestions_json" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_extraction_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "template_audit_logs" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "old_value_json" JSONB,
    "new_value_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "document_templates_issuer_id_idx" ON "document_templates"("issuer_id");
CREATE INDEX IF NOT EXISTS "document_templates_status_idx" ON "document_templates"("status");
CREATE INDEX IF NOT EXISTS "document_templates_source_template_id_idx" ON "document_templates"("source_template_id");
CREATE INDEX IF NOT EXISTS "document_template_fields_template_id_idx" ON "document_template_fields"("template_id");
CREATE INDEX IF NOT EXISTS "document_template_fields_field_key_idx" ON "document_template_fields"("field_key");
CREATE INDEX IF NOT EXISTS "template_extraction_logs_template_id_idx" ON "template_extraction_logs"("template_id");
CREATE INDEX IF NOT EXISTS "template_extraction_logs_extraction_status_idx" ON "template_extraction_logs"("extraction_status");
CREATE INDEX IF NOT EXISTS "template_audit_logs_template_id_idx" ON "template_audit_logs"("template_id");
CREATE INDEX IF NOT EXISTS "template_audit_logs_user_id_idx" ON "template_audit_logs"("user_id");
CREATE INDEX IF NOT EXISTS "template_audit_logs_action_idx" ON "template_audit_logs"("action");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'document_template_fields_template_id_fkey'
    ) THEN
        ALTER TABLE "document_template_fields"
        ADD CONSTRAINT "document_template_fields_template_id_fkey"
        FOREIGN KEY ("template_id") REFERENCES "document_templates"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'template_extraction_logs_template_id_fkey'
    ) THEN
        ALTER TABLE "template_extraction_logs"
        ADD CONSTRAINT "template_extraction_logs_template_id_fkey"
        FOREIGN KEY ("template_id") REFERENCES "document_templates"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'template_audit_logs_template_id_fkey'
    ) THEN
        ALTER TABLE "template_audit_logs"
        ADD CONSTRAINT "template_audit_logs_template_id_fkey"
        FOREIGN KEY ("template_id") REFERENCES "document_templates"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
