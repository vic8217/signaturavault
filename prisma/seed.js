require("dotenv/config");

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { seedRequestDemoIssuer } = require("./demo-request-seed");

const adapter = new PrismaPg(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });
const HAVENXSIG_CLIENT_ID = "havenxsig_client";

function envFlag(name) {
  return ["1", "true", "yes"].includes(
    String(process.env[name] || "").trim().toLowerCase(),
  );
}

function serviceSecret() {
  return (
    process.env.HAVEN_SIGNATURA_SERVICE_SECRET?.trim() ||
    process.env.HAVENXSIG_CLIENT_SECRET?.trim() ||
    ""
  );
}

async function ensureHavenxSigClient() {
  const redirectUris = [
    process.env.HAVENXSIG_CALLBACK_URL || "http://localhost:3001/auth/callback",
  ];
  const allowedOrigins = [process.env.HAVENXSIG_ORIGIN || "http://localhost:3001"];
  const clientSecret = serviceSecret() || "dev_secret_change_later";

  const existing = await prisma.apiClient.findUnique({
    where: { clientId: HAVENXSIG_CLIENT_ID },
  });

  if (existing) {
    return prisma.apiClient.update({
      where: { id: existing.id },
      data: {
        redirectUris,
        allowedOrigins,
        clientSecret,
        status: "active",
      },
    });
  }

  return prisma.apiClient.create({
    data: {
      name: "HavenxSig",
      clientId: HAVENXSIG_CLIENT_ID,
      clientSecret,
      redirectUris,
      allowedOrigins,
      status: "active",
    },
  });
}

async function resetDatabase() {
  await prisma.privateFieldKeyAuthorization.deleteMany();
  await prisma.encryptedPrivateField.deleteMany();
  await prisma.privateFieldKeyReference.deleteMany();
  await prisma.merkleProof.deleteMany();
  await prisma.merkleBatch.deleteMany();
  await prisma.blockchainAnchor.deleteMany();
  await prisma.documentRecord.deleteMany();
  await prisma.templateExtractionLog.deleteMany();
  await prisma.templateAuditLog.deleteMany();
  await prisma.documentTemplateField.deleteMany();
  await prisma.templateVersion.deleteMany();
  await prisma.documentTemplate.deleteMany();
  await prisma.documentType.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.auditAnchor.deleteMany();
  await prisma.consent.deleteMany();
  await prisma.authorizationCode.deleteMany();
  await prisma.signaturaSession.deleteMany();
  await prisma.securityAuditLog.deleteMany();
  await prisma.securityEventLog.deleteMany();
  await prisma.authChallenge.deleteMany();
  await prisma.recoveryCode.deleteMany();
  await prisma.trustedDevice.deleteMany();
  await prisma.webAuthnCredential.deleteMany();
  await prisma.documentRequest.deleteMany();
  await prisma.issuerInvitation.deleteMany();
  await prisma.issuerUser.deleteMany();
  await prisma.issuerAuthorizationCode.deleteMany();
  await prisma.issuerApiKey.deleteMany();
  await prisma.issuerApiClient.deleteMany();
  await prisma.issuer.deleteMany();
  await prisma.apiLog.deleteMany();
  await prisma.webhook.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.apiClient.deleteMany();
}

async function main() {
  const shouldReset = envFlag("SEED_RESET");
  const shouldSeedDemoIssuer = envFlag("SEED_REQUEST_DEMO_ISSUER");

  if (shouldReset) {
    console.log("SEED_RESET=1 — wiping database before seed.");
    await resetDatabase();
  }

  await ensureHavenxSigClient();

  if (shouldSeedDemoIssuer) {
    const demo = await seedRequestDemoIssuer(prisma);
    console.log("Demo request flow seed complete:", {
      tenantId: demo.tenantId,
      issuerId: demo.issuerId,
      keyRef: demo.keyRef,
      staffActivationUrl: demo.staffActivationUrl,
    });
  }

  if (shouldReset) {
    console.log(
      "Signatura seed complete — database reset, HavenxSig OAuth client restored.",
    );
  } else if (shouldSeedDemoIssuer) {
    console.log(
      "Signatura demo seed complete — existing users and sessions preserved. Use SEED_RESET=1 for a full wipe.",
    );
  } else {
    console.log(
      "Signatura seed complete — HavenxSig OAuth client ensured. Set SEED_REQUEST_DEMO_ISSUER=1 to seed demo issuer data.",
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
