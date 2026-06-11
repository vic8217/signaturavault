const crypto = require("node:crypto");

const REQUEST_DEMO_TENANT_ID = "tenant_request_demo";
const REQUEST_DEMO_ISSUER_ID = "issuer_request_demo";
const DEMO_KEY_REF = "ztpf_tenant_request_demo_1_demoseedkey";
const DEMO_BOOTSTRAP_USER_ID = "user_demo_seed_bootstrap";
const DEMO_STAFF_ISSUER_USER_ID = "issuer_user_demo_staff";
const DEMO_STAFF_INVITATION_ID = "issuer_invite_demo_staff";
const DEMO_STAFF_ACTIVATION_TOKEN =
  process.env.DEMO_STAFF_ACTIVATION_TOKEN?.trim() ||
  "demo-signatura-staff-activation-token-dev-only";

function hashActivationToken(token) {
  const secret =
    process.env.ACTIVATION_TOKEN_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    "development-only-activation-secret-change-me";
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}

function demoPlaceholderBase64url(bytes = 32) {
  return Buffer.alloc(bytes, 7).toString("base64url");
}

async function ensureDemoBootstrapUser(prisma) {
  return prisma.user.upsert({
    where: { id: DEMO_BOOTSTRAP_USER_ID },
    update: {},
    create: {
      id: DEMO_BOOTSTRAP_USER_ID,
      signaturaId: "SIG-DEMO-BOOTSTRAP",
      accountStatus: "active",
      trustLevel: 0,
    },
  });
}

async function seedRequestDemoKeyReference(prisma) {
  const existing = await prisma.privateFieldKeyReference.findFirst({
    where: {
      tenantId: REQUEST_DEMO_TENANT_ID,
      status: "active",
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    console.log(`Demo tenant key reference already active (${existing.keyRef}).`);
    return existing;
  }

  await ensureDemoBootstrapUser(prisma);

  const placeholder = demoPlaceholderBase64url(32);
  const created = await prisma.privateFieldKeyReference.create({
    data: {
      id: "keyref_request_demo_seed",
      tenantId: REQUEST_DEMO_TENANT_ID,
      hoaId: REQUEST_DEMO_TENANT_ID,
      keyRef: DEMO_KEY_REF,
      algorithm: "AES-256-GCM",
      wrappedKey: placeholder,
      salt: demoPlaceholderBase64url(16),
      iv: demoPlaceholderBase64url(12),
      tag: demoPlaceholderBase64url(16),
      kdfName: "scrypt",
      kdfParams: { N: 16384, r: 8, p: 1, keyLength: 32 },
      unlockProofSalt: demoPlaceholderBase64url(16),
      unlockProofHash: demoPlaceholderBase64url(32),
      version: 1,
      status: "active",
      createdByUserId: DEMO_BOOTSTRAP_USER_ID,
    },
  });

  console.log(`Demo tenant key reference enrolled (${created.keyRef}).`);
  return created;
}

async function seedRequestDemoStaffInvitation(prisma) {
  const activeStaff = await prisma.issuerUser.findFirst({
    where: {
      tenantId: REQUEST_DEMO_TENANT_ID,
      issuerId: REQUEST_DEMO_ISSUER_ID,
      role: "ISSUER_STAFF",
      status: "active",
      userId: { not: null },
    },
  });

  if (activeStaff) {
    console.log("Demo issuer staff already activated — skipping invitation seed.");
    return null;
  }

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const hiddenContact = `${DEMO_STAFF_INVITATION_ID}@hidden.signatura.local`;

  await prisma.issuerUser.upsert({
    where: { id: DEMO_STAFF_ISSUER_USER_ID },
    update: {
      tenantId: REQUEST_DEMO_TENANT_ID,
      issuerId: REQUEST_DEMO_ISSUER_ID,
      role: "ISSUER_STAFF",
      status: "invited",
      invitedAt: new Date(),
    },
    create: {
      id: DEMO_STAFF_ISSUER_USER_ID,
      tenantId: REQUEST_DEMO_TENANT_ID,
      issuerId: REQUEST_DEMO_ISSUER_ID,
      email: hiddenContact,
      role: "ISSUER_STAFF",
      status: "invited",
      invitedAt: new Date(),
    },
  });

  await prisma.issuerInvitation.upsert({
    where: { id: DEMO_STAFF_INVITATION_ID },
    update: {
      tenantId: REQUEST_DEMO_TENANT_ID,
      issuerId: REQUEST_DEMO_ISSUER_ID,
      issuerUserId: DEMO_STAFF_ISSUER_USER_ID,
      role: "ISSUER_STAFF",
      deliveryChannel: "SECURE_ENTERPRISE_CHANNEL",
      recipient: "[hidden]",
      tokenHash: hashActivationToken(DEMO_STAFF_ACTIVATION_TOKEN),
      expiresAt,
      usedAt: null,
    },
    create: {
      id: DEMO_STAFF_INVITATION_ID,
      tenantId: REQUEST_DEMO_TENANT_ID,
      issuerId: REQUEST_DEMO_ISSUER_ID,
      issuerUserId: DEMO_STAFF_ISSUER_USER_ID,
      email: hiddenContact,
      role: "ISSUER_STAFF",
      deliveryChannel: "SECURE_ENTERPRISE_CHANNEL",
      recipient: "[hidden]",
      tokenHash: hashActivationToken(DEMO_STAFF_ACTIVATION_TOKEN),
      expiresAt,
    },
  });

  const activationUrl = `/issuer/activate?token=${encodeURIComponent(DEMO_STAFF_ACTIVATION_TOKEN)}`;
  console.log(`Demo issuer staff invitation ready. Activation path: ${activationUrl}`);
  return { activationUrl, invitationId: DEMO_STAFF_INVITATION_ID };
}

async function seedRequestDemoIssuer(prisma) {
  await prisma.tenant.upsert({
    where: { id: REQUEST_DEMO_TENANT_ID },
    update: { name: "Request Demo University" },
    create: {
      id: REQUEST_DEMO_TENANT_ID,
      name: "Request Demo University",
    },
  });

  await prisma.issuer.upsert({
    where: { id: REQUEST_DEMO_ISSUER_ID },
    update: {
      tenantId: REQUEST_DEMO_TENANT_ID,
      name: "Request Demo University",
      type: "education",
      status: "active",
      acceptsRequests: true,
    },
    create: {
      id: REQUEST_DEMO_ISSUER_ID,
      tenantId: REQUEST_DEMO_TENANT_ID,
      name: "Request Demo University",
      type: "education",
      status: "active",
      acceptsRequests: true,
    },
  });

  const documentTypes = [
    {
      id: "doctype_request_transcript",
      tenantId: REQUEST_DEMO_TENANT_ID,
      name: "Official Transcript",
      description: "Request an official academic transcript",
    },
    {
      id: "doctype_request_enrollment",
      tenantId: REQUEST_DEMO_TENANT_ID,
      name: "Enrollment Verification",
      description: "Proof of current enrollment",
    },
  ];

  for (const documentType of documentTypes) {
    await prisma.documentType.upsert({
      where: { id: documentType.id },
      update: documentType,
      create: documentType,
    });
  }

  const templateId = "tpl_request_demo_transcript";
  await prisma.documentTemplate.upsert({
    where: { id: templateId },
    update: {
      tenantId: REQUEST_DEMO_TENANT_ID,
      issuerId: REQUEST_DEMO_ISSUER_ID,
      documentTypeId: "doctype_request_transcript",
      name: "Transcript Request Form",
      status: "published",
      version: 1,
    },
    create: {
      id: templateId,
      tenantId: REQUEST_DEMO_TENANT_ID,
      issuerId: REQUEST_DEMO_ISSUER_ID,
      documentTypeId: "doctype_request_transcript",
      name: "Transcript Request Form",
      status: "published",
      version: 1,
    },
  });

  await prisma.documentTemplateField.deleteMany({
    where: { templateId },
  });
  await prisma.documentTemplateField.createMany({
    data: [
      {
        id: "tpl_field_request_purpose",
        templateId,
        fieldKey: "purpose",
        fieldLabel: "Purpose",
        fieldType: "textarea",
        required: true,
        encrypted: true,
        sortOrder: 0,
      },
      {
        id: "tpl_field_request_private_ref",
        templateId,
        fieldKey: "privateReference",
        fieldLabel: "Student number",
        fieldType: "text",
        required: true,
        encrypted: true,
        sortOrder: 1,
      },
    ],
  });

  await seedRequestDemoKeyReference(prisma);
  const staffInvite = await seedRequestDemoStaffInvitation(prisma);

  console.log(
    `Request demo issuer seeded (${REQUEST_DEMO_ISSUER_ID}) with acceptsRequests=true.`,
  );

  return {
    tenantId: REQUEST_DEMO_TENANT_ID,
    issuerId: REQUEST_DEMO_ISSUER_ID,
    keyRef: DEMO_KEY_REF,
    staffActivationUrl: staffInvite?.activationUrl || null,
  };
}

module.exports = {
  REQUEST_DEMO_TENANT_ID,
  REQUEST_DEMO_ISSUER_ID,
  DEMO_KEY_REF,
  DEMO_STAFF_ACTIVATION_TOKEN,
  seedRequestDemoIssuer,
};
