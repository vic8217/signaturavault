CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "external_ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "identity_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "application_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "invited_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membership_roles" (
    "id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "applications_code_key" ON "applications"("code");
CREATE INDEX "applications_status_idx" ON "applications"("status");

CREATE INDEX "organizations_type_status_idx" ON "organizations"("type", "status");
CREATE INDEX "organizations_external_ref_idx" ON "organizations"("external_ref");

CREATE INDEX "memberships_identity_id_status_idx" ON "memberships"("identity_id", "status");
CREATE INDEX "memberships_organization_id_status_idx" ON "memberships"("organization_id", "status");
CREATE INDEX "memberships_application_id_status_idx" ON "memberships"("application_id", "status");
CREATE UNIQUE INDEX "memberships_identity_id_application_id_organization_id_key" ON "memberships"("identity_id", "application_id", "organization_id");

CREATE INDEX "roles_application_id_status_idx" ON "roles"("application_id", "status");
CREATE INDEX "roles_organization_id_status_idx" ON "roles"("organization_id", "status");
CREATE UNIQUE INDEX "roles_application_id_organization_id_code_key" ON "roles"("application_id", "organization_id", "code");

CREATE UNIQUE INDEX "membership_roles_membership_id_role_id_key" ON "membership_roles"("membership_id", "role_id");
CREATE INDEX "membership_roles_role_id_idx" ON "membership_roles"("role_id");

CREATE UNIQUE INDEX "permissions_application_id_code_key" ON "permissions"("application_id", "code");
CREATE INDEX "permissions_status_idx" ON "permissions"("status");

CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

ALTER TABLE "memberships" ADD CONSTRAINT "memberships_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roles" ADD CONSTRAINT "roles_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "applications" ("id", "code", "name", "status", "updated_at")
VALUES
    ('app_signatura', 'SIGNATURA', 'Signatura', 'ACTIVE', CURRENT_TIMESTAMP),
    ('app_accura', 'ACCURA', 'Accura', 'ACTIVE', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "roles" ("id", "application_id", "organization_id", "code", "name", "scope", "status", "updated_at")
SELECT 'role_signatura_system_admin', "id", NULL, 'SIGNATURA_SYSTEM_ADMIN', 'Signatura System Admin', 'PLATFORM', 'ACTIVE', CURRENT_TIMESTAMP
FROM "applications" WHERE "code" = 'SIGNATURA'
ON CONFLICT ("application_id", "organization_id", "code") DO NOTHING;

INSERT INTO "roles" ("id", "application_id", "organization_id", "code", "name", "scope", "status", "updated_at")
SELECT 'role_accura_system_admin', "id", NULL, 'ACCURA_SYSTEM_ADMIN', 'Accura System Admin', 'PLATFORM', 'ACTIVE', CURRENT_TIMESTAMP
FROM "applications" WHERE "code" = 'ACCURA'
ON CONFLICT ("application_id", "organization_id", "code") DO NOTHING;

INSERT INTO "memberships" ("id", "identity_id", "organization_id", "application_id", "status", "updated_at")
SELECT
    'membership_signatura_admin_' || "users"."id",
    "users"."id",
    NULL,
    "applications"."id",
    'ACTIVE',
    CURRENT_TIMESTAMP
FROM "users"
JOIN "applications" ON "applications"."code" = 'SIGNATURA'
WHERE "users"."signatura_id" LIKE 'SIG-A-%'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "membership_roles" ("id", "membership_id", "role_id")
SELECT
    'membership_role_signatura_admin_' || "users"."id",
    'membership_signatura_admin_' || "users"."id",
    "roles"."id"
FROM "users"
JOIN "applications" ON "applications"."code" = 'SIGNATURA'
JOIN "roles" ON "roles"."application_id" = "applications"."id"
    AND "roles"."organization_id" IS NULL
    AND "roles"."code" = 'SIGNATURA_SYSTEM_ADMIN'
WHERE "users"."signatura_id" LIKE 'SIG-A-%'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "organizations" ("id", "name", "type", "external_ref", "status", "updated_at")
SELECT DISTINCT
    "issuer_users"."tenant_id",
    COALESCE("issuers"."name", "issuer_users"."tenant_id"),
    'ISSUER',
    "issuer_users"."tenant_id",
    'ACTIVE',
    CURRENT_TIMESTAMP
FROM "issuer_users"
LEFT JOIN "issuers" ON "issuers"."id" = "issuer_users"."issuer_id"
WHERE "issuer_users"."tenant_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "roles" ("id", "application_id", "organization_id", "code", "name", "scope", "status", "updated_at")
SELECT DISTINCT
    'role_signatura_' || lower("issuer_users"."role") || '_' || md5("issuer_users"."tenant_id"),
    "applications"."id",
    "issuer_users"."tenant_id",
    "issuer_users"."role",
    replace(initcap(replace(lower("issuer_users"."role"), '_', ' ')), 'Issuer', 'Issuer'),
    'ORGANIZATION',
    'ACTIVE',
    CURRENT_TIMESTAMP
FROM "issuer_users"
JOIN "applications" ON "applications"."code" = 'SIGNATURA'
WHERE "issuer_users"."status" = 'active'
    AND "issuer_users"."user_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "memberships" ("id", "identity_id", "organization_id", "application_id", "status", "updated_at")
SELECT DISTINCT
    'membership_issuer_' || "issuer_users"."user_id" || '_' || md5("issuer_users"."tenant_id"),
    "issuer_users"."user_id",
    "issuer_users"."tenant_id",
    "applications"."id",
    'ACTIVE',
    CURRENT_TIMESTAMP
FROM "issuer_users"
JOIN "applications" ON "applications"."code" = 'SIGNATURA'
WHERE "issuer_users"."status" = 'active'
    AND "issuer_users"."user_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "membership_roles" ("id", "membership_id", "role_id")
SELECT DISTINCT
    'membership_role_issuer_' || "issuer_users"."user_id" || '_' || md5("issuer_users"."tenant_id" || "issuer_users"."role"),
    'membership_issuer_' || "issuer_users"."user_id" || '_' || md5("issuer_users"."tenant_id"),
    'role_signatura_' || lower("issuer_users"."role") || '_' || md5("issuer_users"."tenant_id")
FROM "issuer_users"
WHERE "issuer_users"."status" = 'active'
    AND "issuer_users"."user_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "organizations" ("id", "name", "type", "external_ref", "status", "updated_at")
SELECT DISTINCT
    COALESCE("signatura_app_links"."company_id", "signatura_app_links"."company_code"),
    COALESCE("signatura_app_links"."company_name", "signatura_app_links"."company_code", "signatura_app_links"."company_id"),
    'ACCURA_COMPANY',
    COALESCE("signatura_app_links"."company_id", "signatura_app_links"."company_code"),
    'ACTIVE',
    CURRENT_TIMESTAMP
FROM "signatura_app_links"
WHERE "signatura_app_links"."source_app" = 'ACCURA'
    AND "signatura_app_links"."status" = 'ACTIVE'
    AND COALESCE("signatura_app_links"."company_id", "signatura_app_links"."company_code") IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "memberships" ("id", "identity_id", "organization_id", "application_id", "status", "updated_at")
SELECT DISTINCT
    'membership_accura_' || "signatura_app_links"."user_id" || '_' || md5(COALESCE("signatura_app_links"."company_id", "signatura_app_links"."company_code", 'platform')),
    "signatura_app_links"."user_id",
    COALESCE("signatura_app_links"."company_id", "signatura_app_links"."company_code"),
    "applications"."id",
    'ACTIVE',
    CURRENT_TIMESTAMP
FROM "signatura_app_links"
JOIN "applications" ON "applications"."code" = 'ACCURA'
WHERE "signatura_app_links"."source_app" = 'ACCURA'
    AND "signatura_app_links"."status" = 'ACTIVE'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "roles" ("id", "application_id", "organization_id", "code", "name", "scope", "status", "updated_at")
SELECT DISTINCT
    'role_accura_' || lower(COALESCE("signatura_app_links"."role_prefix", 'member')) || '_' || md5(COALESCE("signatura_app_links"."company_id", "signatura_app_links"."company_code", 'platform')),
    "applications"."id",
    COALESCE("signatura_app_links"."company_id", "signatura_app_links"."company_code"),
    'ACCURA_' || upper(COALESCE("signatura_app_links"."role_prefix", 'MEMBER')),
    COALESCE("signatura_app_links"."role", 'Accura Member'),
    CASE WHEN COALESCE("signatura_app_links"."company_id", "signatura_app_links"."company_code") IS NULL THEN 'PLATFORM' ELSE 'ORGANIZATION' END,
    'ACTIVE',
    CURRENT_TIMESTAMP
FROM "signatura_app_links"
JOIN "applications" ON "applications"."code" = 'ACCURA'
WHERE "signatura_app_links"."source_app" = 'ACCURA'
    AND "signatura_app_links"."status" = 'ACTIVE'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "membership_roles" ("id", "membership_id", "role_id")
SELECT DISTINCT
    'membership_role_accura_' || "signatura_app_links"."user_id" || '_' || md5(COALESCE("signatura_app_links"."company_id", "signatura_app_links"."company_code", 'platform') || COALESCE("signatura_app_links"."role_prefix", 'member')),
    'membership_accura_' || "signatura_app_links"."user_id" || '_' || md5(COALESCE("signatura_app_links"."company_id", "signatura_app_links"."company_code", 'platform')),
    'role_accura_' || lower(COALESCE("signatura_app_links"."role_prefix", 'member')) || '_' || md5(COALESCE("signatura_app_links"."company_id", "signatura_app_links"."company_code", 'platform'))
FROM "signatura_app_links"
WHERE "signatura_app_links"."source_app" = 'ACCURA'
    AND "signatura_app_links"."status" = 'ACTIVE'
ON CONFLICT ("id") DO NOTHING;
