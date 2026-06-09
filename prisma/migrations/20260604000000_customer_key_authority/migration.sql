CREATE TABLE "customer_keys" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "hoa_id" TEXT,
    "key_ref" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "wrapped_key" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "kdf_name" TEXT NOT NULL,
    "kdf_params" JSONB NOT NULL,
    "unlock_proof_salt" TEXT NOT NULL,
    "unlock_proof_hash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at" TIMESTAMP(3),

    CONSTRAINT "customer_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_key_unlocks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "hoa_id" TEXT,
    "key_ref" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "credential_id" TEXT,
    "purpose" TEXT NOT NULL,
    "authorization_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'authorized',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_key_unlocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "encrypted_private_fields" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "hoa_id" TEXT,
    "owner_user_id" TEXT,
    "record_type" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "key_ref" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "aad" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "encrypted_private_fields_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_keys_key_ref_key" ON "customer_keys"("key_ref");
CREATE INDEX "customer_keys_tenant_id_idx" ON "customer_keys"("tenant_id");
CREATE INDEX "customer_keys_hoa_id_idx" ON "customer_keys"("hoa_id");
CREATE INDEX "customer_keys_status_idx" ON "customer_keys"("status");

CREATE UNIQUE INDEX "customer_key_unlocks_authorization_hash_key" ON "customer_key_unlocks"("authorization_hash");
CREATE INDEX "customer_key_unlocks_tenant_id_idx" ON "customer_key_unlocks"("tenant_id");
CREATE INDEX "customer_key_unlocks_hoa_id_idx" ON "customer_key_unlocks"("hoa_id");
CREATE INDEX "customer_key_unlocks_key_ref_idx" ON "customer_key_unlocks"("key_ref");
CREATE INDEX "customer_key_unlocks_user_id_idx" ON "customer_key_unlocks"("user_id");
CREATE INDEX "customer_key_unlocks_expires_at_idx" ON "customer_key_unlocks"("expires_at");

CREATE UNIQUE INDEX "encrypted_private_fields_tenant_id_record_type_record_id_field_key_key" ON "encrypted_private_fields"("tenant_id", "record_type", "record_id", "field_key");
CREATE INDEX "encrypted_private_fields_tenant_id_idx" ON "encrypted_private_fields"("tenant_id");
CREATE INDEX "encrypted_private_fields_hoa_id_idx" ON "encrypted_private_fields"("hoa_id");
CREATE INDEX "encrypted_private_fields_owner_user_id_idx" ON "encrypted_private_fields"("owner_user_id");
CREATE INDEX "encrypted_private_fields_key_ref_idx" ON "encrypted_private_fields"("key_ref");

ALTER TABLE "customer_key_unlocks" ADD CONSTRAINT "customer_key_unlocks_key_ref_fkey" FOREIGN KEY ("key_ref") REFERENCES "customer_keys"("key_ref") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "encrypted_private_fields" ADD CONSTRAINT "encrypted_private_fields_key_ref_fkey" FOREIGN KEY ("key_ref") REFERENCES "customer_keys"("key_ref") ON DELETE RESTRICT ON UPDATE CASCADE;
