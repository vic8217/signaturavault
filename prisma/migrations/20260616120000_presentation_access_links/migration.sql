CREATE TABLE "presentation_access_links" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_prefix" TEXT NOT NULL,
    "presentation_slug" TEXT NOT NULL,
    "viewer_name" TEXT,
    "viewer_email" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "max_views" INTEGER,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presentation_access_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "presentation_access_views" (
    "id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "presentation_slug" TEXT NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "presentation_access_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "presentation_access_links_token_hash_key" ON "presentation_access_links"("token_hash");
CREATE INDEX "presentation_access_links_presentation_slug_idx" ON "presentation_access_links"("presentation_slug");
CREATE INDEX "presentation_access_links_expires_at_idx" ON "presentation_access_links"("expires_at");
CREATE INDEX "presentation_access_links_is_revoked_idx" ON "presentation_access_links"("is_revoked");
CREATE INDEX "presentation_access_views_token_id_idx" ON "presentation_access_views"("token_id");
CREATE INDEX "presentation_access_views_presentation_slug_idx" ON "presentation_access_views"("presentation_slug");
CREATE INDEX "presentation_access_views_viewed_at_idx" ON "presentation_access_views"("viewed_at");

ALTER TABLE "presentation_access_views"
    ADD CONSTRAINT "presentation_access_views_token_id_fkey"
    FOREIGN KEY ("token_id") REFERENCES "presentation_access_links"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
