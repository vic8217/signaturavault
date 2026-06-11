-- Phase 5.0: optional owner/request linkage fields on document_records (not wired to workflow yet)
ALTER TABLE "document_records" ADD COLUMN IF NOT EXISTS "owner_user_id" TEXT;
ALTER TABLE "document_records" ADD COLUMN IF NOT EXISTS "document_request_id" TEXT;
ALTER TABLE "document_records" ADD COLUMN IF NOT EXISTS "document_type_label" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "document_records_document_request_id_key"
  ON "document_records"("document_request_id")
  WHERE "document_request_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "document_records_owner_user_id_idx"
  ON "document_records"("owner_user_id");
