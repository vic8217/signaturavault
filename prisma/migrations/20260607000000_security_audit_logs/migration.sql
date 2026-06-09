CREATE TABLE "security_audit_logs" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT,
    "tenant_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "ip_address" TEXT,
    "device" TEXT,
    "details" JSONB,

    CONSTRAINT "security_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "security_audit_logs_tenant_id_idx" ON "security_audit_logs"("tenant_id");
CREATE INDEX "security_audit_logs_user_id_idx" ON "security_audit_logs"("user_id");
CREATE INDEX "security_audit_logs_action_idx" ON "security_audit_logs"("action");
