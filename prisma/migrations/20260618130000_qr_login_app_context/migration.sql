ALTER TABLE "trusted_device_login_challenges"
ADD COLUMN "client_id" TEXT,
ADD COLUMN "source_app" TEXT,
ADD COLUMN "requester_origin" TEXT,
ADD COLUMN "requested_assurance_level" TEXT;
