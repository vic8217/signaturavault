ALTER TABLE "presentation_access_links"
    ADD COLUMN IF NOT EXISTS "token_cipher" TEXT;
