CREATE TABLE IF NOT EXISTS "issued_documents" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "document_id" TEXT NOT NULL,
  "issuer_id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "issued_at" TIMESTAMP(3) NOT NULL,
  "delivery_status" TEXT NOT NULL,
  "linkage_type" TEXT NOT NULL,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "issued_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "issued_documents_request_id_key"
  ON "issued_documents"("request_id");

CREATE INDEX IF NOT EXISTS "issued_documents_tenant_id_idx"
  ON "issued_documents"("tenant_id");

CREATE INDEX IF NOT EXISTS "issued_documents_owner_id_idx"
  ON "issued_documents"("owner_id");

CREATE INDEX IF NOT EXISTS "issued_documents_issuer_id_idx"
  ON "issued_documents"("issuer_id");

CREATE INDEX IF NOT EXISTS "issued_documents_document_id_idx"
  ON "issued_documents"("document_id");

CREATE INDEX IF NOT EXISTS "issued_documents_delivery_status_idx"
  ON "issued_documents"("delivery_status");

ALTER TABLE "issued_documents"
  ADD CONSTRAINT "issued_documents_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "document_requests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
