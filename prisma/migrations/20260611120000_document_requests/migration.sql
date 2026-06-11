ALTER TABLE "issuers" ADD COLUMN "accepts_requests" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "issuers_accepts_requests_status_idx" ON "issuers"("accepts_requests", "status");

CREATE TABLE "document_requests" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "issuer_id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "document_type_id" TEXT NOT NULL,
    "document_type_label" TEXT,
    "document_template_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reference_code" TEXT NOT NULL,
    "issued_document_record_id" TEXT,
    "wallet_delivered" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_by_user_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_requests_reference_code_key" ON "document_requests"("reference_code");
CREATE INDEX "document_requests_tenant_id_status_idx" ON "document_requests"("tenant_id", "status");
CREATE INDEX "document_requests_issuer_id_status_idx" ON "document_requests"("issuer_id", "status");
CREATE INDEX "document_requests_owner_user_id_status_idx" ON "document_requests"("owner_user_id", "status");
CREATE INDEX "document_requests_owner_user_id_issuer_id_document_type_id_status_idx" ON "document_requests"("owner_user_id", "issuer_id", "document_type_id", "status");
