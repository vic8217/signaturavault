ALTER TABLE "document_records"
ADD COLUMN IF NOT EXISTS "issuer_id" TEXT,
ADD COLUMN IF NOT EXISTS "document_hash" TEXT,
ADD COLUMN IF NOT EXISTS "anchor_status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS "anchor_batch_id" TEXT;

UPDATE "document_records"
SET "document_hash" = "hash"
WHERE "document_hash" IS NULL;

UPDATE "document_records"
SET "status" = 'valid'
WHERE "status" = 'issued';

CREATE TABLE IF NOT EXISTS "anchor_pool" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "document_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "anchor_pool_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "merkle_batches" (
    "id" TEXT NOT NULL,
    "merkle_root" TEXT NOT NULL,
    "batch_size" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "publish_method" TEXT NOT NULL,
    "chain" TEXT,
    "transaction_id" TEXT,
    "block_number" TEXT,
    "timestamp_proof" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "merkle_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "merkle_proofs" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "leaf_hash" TEXT NOT NULL,
    "proof_path" JSONB NOT NULL,
    "proof_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "merkle_proofs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "document_records_issuer_id_idx" ON "document_records"("issuer_id");
CREATE INDEX IF NOT EXISTS "document_records_anchor_status_idx" ON "document_records"("anchor_status");
CREATE INDEX IF NOT EXISTS "document_records_anchor_batch_id_idx" ON "document_records"("anchor_batch_id");
CREATE INDEX IF NOT EXISTS "anchor_pool_document_id_idx" ON "anchor_pool"("document_id");
CREATE INDEX IF NOT EXISTS "anchor_pool_document_hash_idx" ON "anchor_pool"("document_hash");
CREATE INDEX IF NOT EXISTS "anchor_pool_status_idx" ON "anchor_pool"("status");
CREATE INDEX IF NOT EXISTS "merkle_batches_status_idx" ON "merkle_batches"("status");
CREATE INDEX IF NOT EXISTS "merkle_batches_publish_method_idx" ON "merkle_batches"("publish_method");
CREATE INDEX IF NOT EXISTS "merkle_batches_transaction_id_idx" ON "merkle_batches"("transaction_id");
CREATE INDEX IF NOT EXISTS "merkle_proofs_document_id_idx" ON "merkle_proofs"("document_id");
CREATE INDEX IF NOT EXISTS "merkle_proofs_batch_id_idx" ON "merkle_proofs"("batch_id");
CREATE INDEX IF NOT EXISTS "merkle_proofs_leaf_hash_idx" ON "merkle_proofs"("leaf_hash");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'anchor_pool_document_id_fkey'
    ) THEN
        ALTER TABLE "anchor_pool"
        ADD CONSTRAINT "anchor_pool_document_id_fkey"
        FOREIGN KEY ("document_id") REFERENCES "document_records"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'merkle_proofs_document_id_fkey'
    ) THEN
        ALTER TABLE "merkle_proofs"
        ADD CONSTRAINT "merkle_proofs_document_id_fkey"
        FOREIGN KEY ("document_id") REFERENCES "document_records"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'merkle_proofs_batch_id_fkey'
    ) THEN
        ALTER TABLE "merkle_proofs"
        ADD CONSTRAINT "merkle_proofs_batch_id_fkey"
        FOREIGN KEY ("batch_id") REFERENCES "merkle_batches"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
