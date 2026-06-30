import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('new account onboarding continues to passkey creation before trusted device registration', async () => {
	const source = await readFile(
		new URL('../src/components/RegisterPasskeyForm.js', import.meta.url),
		'utf8',
	);
	const createAccountBody = source.slice(
		source.indexOf('async function createAccount'),
		source.indexOf('async function createPasskey'),
	);

	assert.match(createAccountBody, /setCreatedAccount\(data\.user\)/);
	assert.match(createAccountBody, /setRegistrationToken\(data\.registrationToken \|\| ''\)/);
	assert.match(createAccountBody, /accountType/);
	assert.match(createAccountBody, /setStep\('passkey'\)/);
	assert.doesNotMatch(createAccountBody, /returnToLogin\(\)/);
});

test('pending registration stores only session resume markers in browser storage', async () => {
	const source = await readFile(
		new URL('../src/components/RegisterPasskeyForm.js', import.meta.url),
		'utf8',
	);
	const storageWriter = source.slice(
		source.indexOf('function writePendingRegistration'),
		source.indexOf('function clearPendingRegistration'),
	);
	const createAccountBody = source.slice(
		source.indexOf('async function createAccount'),
		source.indexOf('async function createPasskey'),
	);
	const createPasskeyBody = source.slice(
		source.indexOf('async function createPasskey'),
		source.indexOf('async function continueToTrustedDevice'),
	);

	assert.match(storageWriter, /registrationSessionId/);
	assert.match(storageWriter, /signaturaId/);
	assert.match(storageWriter, /currentStep/);
	assert.doesNotMatch(storageWriter, /fullName/);
	assert.doesNotMatch(storageWriter, /handphone/);
	assert.doesNotMatch(storageWriter, /email/);
	assert.doesNotMatch(storageWriter, /recoveryPhrase/);
	assert.doesNotMatch(storageWriter, /registrationToken/);
	assert.match(createAccountBody, /writePendingRegistration/);
	assert.match(createPasskeyBody, /setStep\('passkey_success'\)/);
	assert.doesNotMatch(createPasskeyBody, /clearPendingRegistration/);
});

test('registration supports session resume and explicit cancellation endpoints', async () => {
	const registerForm = await readFile(
		new URL('../src/components/RegisterPasskeyForm.js', import.meta.url),
		'utf8',
	);
	const accountRoute = await readFile(
		new URL('../src/app/api/auth/register/account/route.ts', import.meta.url),
		'utf8',
	);
	const startRoute = await readFile(
		new URL('../src/app/api/auth/register/start/route.ts', import.meta.url),
		'utf8',
	);
	const sessionRoute = await readFile(
		new URL('../src/app/api/auth/register/session/[id]/route.ts', import.meta.url),
		'utf8',
	);
	const cancelRoute = await readFile(
		new URL('../src/app/api/auth/register/cancel/route.ts', import.meta.url),
		'utf8',
	);

	assert.match(accountRoute, /accountStatus: 'pending_passkey_creation'/);
	assert.match(accountRoute, /registrationSessionId/);
	assert.match(startRoute, /registrationSessionId/);
	assert.match(startRoute, /REGISTER_PASSKEY/);
	assert.doesNotMatch(startRoute, /pending_trusted_device_registration/);
	assert.match(sessionRoute, /REGISTRATION_STATUSES\.PASSKEY_CREATED/);
	assert.match(sessionRoute, /registrationStatusCardState/);
	assert.match(cancelRoute, /CANCELLABLE_REGISTRATION_STATUSES/);
	assert.match(registerForm, /Passkey Created Successfully/);
	assert.match(registerForm, /Trusted Device Registered/);
	assert.match(registerForm, /RegistrationStatusCard/);
	assert.match(registerForm, /\/api\/auth\/register\/trusted-device/);
	assert.match(registerForm, /createDeviceBindingSecret/);
	assert.match(registerForm, /storeDeviceBindingSecret/);
	assert.match(registerForm, /deviceBindingSecret/);
	assert.match(sessionRoute, /registration_session_resumed/);
	assert.match(cancelRoute, /registration_cancelled/);
	assert.match(registerForm, /\/api\/auth\/register\/session\/\$\{encodeURIComponent\(pendingSessionId\)\}/);
	assert.match(registerForm, /\/api\/auth\/register\/cancel/);
	assert.match(registerForm, /onClick=\{cancelPendingRegistration\}/);
});

test('registration continue is idempotent for already prepared setup steps', async () => {
	const continueRoute = await readFile(
		new URL('../src/app/api/auth/register/continue/route.ts', import.meta.url),
		'utf8',
	);

	assert.match(continueRoute, /TRUSTED_DEVICE_READY_STEPS/);
	assert.match(continueRoute, /resolveRegistrationStep/);
	assert.match(
		continueRoute,
		/targetStep === 'recovery'[\s\S]+PENDING_RECOVERY_PHRASE/,
	);
	assert.match(continueRoute, /findRegistrationSession/);
	assert.match(continueRoute, /renewIfExpired: true/);
	assert.match(continueRoute, /registrationSessionId: session\.id/);
});

test('trusted device registration retry returns existing trusted device success', async () => {
	const trustedDeviceRoute = await readFile(
		new URL('../src/app/api/auth/register/trusted-device/route.ts', import.meta.url),
		'utf8',
	);

	assert.match(trustedDeviceRoute, /function trustedDeviceSuccessResponse/);
	assert.match(trustedDeviceRoute, /existingTrustedDevice/);
	assert.match(trustedDeviceRoute, /normalizeDeviceBindingSecret/);
	assert.match(trustedDeviceRoute, /trustedDeviceBindingHash/);
	assert.match(trustedDeviceRoute, /deviceBindingSecret/);
	assert.match(
		trustedDeviceRoute,
		/accountStatus: REGISTRATION_STATUSES\.TRUSTED_DEVICE_REGISTERED/,
	);
	assert.doesNotMatch(
		trustedDeviceRoute,
		/Trusted device already registered for this passkey/,
	);
});

test('recovery phrase setup renews registration session and uses safe API parsing', async () => {
	const recoveryRoute = await readFile(
		new URL('../src/app/api/auth/register/recovery/route.ts', import.meta.url),
		'utf8',
	);
	const registerForm = await readFile(
		new URL('../src/components/RegisterPasskeyForm.js', import.meta.url),
		'utf8',
	);
	const continueToRecoveryBody = registerForm.slice(
		registerForm.indexOf('async function continueToRecovery'),
		registerForm.indexOf('async function resumeSetup'),
	);

	assert.match(recoveryRoute, /findRegistrationSession/);
	assert.match(recoveryRoute, /renewIfExpired: true/);
	assert.match(recoveryRoute, /touchRegistrationSession/);
	assert.match(continueToRecoveryBody, /resolveRegistrationContext/);
	assert.match(continueToRecoveryBody, /registrationApiRequest/);
	assert.match(continueToRecoveryBody, /Recovery phrase setup/);
});

test('account activation renews registration session and uses safe API parsing', async () => {
	const activateRoute = await readFile(
		new URL('../src/app/api/auth/register/activate/route.ts', import.meta.url),
		'utf8',
	);
	const registerForm = await readFile(
		new URL('../src/components/RegisterPasskeyForm.js', import.meta.url),
		'utf8',
	);
	const activateAccountBody = registerForm.slice(
		registerForm.indexOf('async function activateAccount'),
		registerForm.indexOf('function updateField'),
	);

	assert.match(activateRoute, /findRegistrationSession/);
	assert.match(activateRoute, /renewIfExpired: true/);
	assert.match(activateRoute, /touchRegistrationSession/);
	assert.match(activateAccountBody, /resolveRegistrationContext/);
	assert.match(activateAccountBody, /registrationApiRequest/);
	assert.match(activateAccountBody, /Account activation/);
});

test('account duplicate contact check protects one universal Signatura identity', async () => {
	const route = await readFile(
		new URL('../src/app/api/auth/register/account/route.ts', import.meta.url),
		'utf8',
	);
	const schema = await readFile(
		new URL('../prisma/schema.prisma', import.meta.url),
		'utf8',
	);

	assert.match(route, /matchingContactUsers\[0\]/);
	assert.match(route, /A Signatura identity already exists/);
	assert.match(route, /attach the new role to the existing Signatura ID/);
	assert.match(route, /linkRequired: true/);
	assert.doesNotMatch(schema, /emailLookupHash\s+String\?\s+@unique/);
	assert.doesNotMatch(schema, /mobileLookupHash\s+String\?\s+@unique/);
	assert.match(schema, /@@index\(\[emailLookupHash\]\)/);
	assert.match(schema, /@@index\(\[mobileLookupHash\]\)/);
});

test('login modal no longer exposes manual portal role buttons', async () => {
	const source = await readFile(
		new URL('../src/components/LoginModal.js', import.meta.url),
		'utf8',
	);

	assert.doesNotMatch(source, /Portal access/);
	assert.doesNotMatch(source, /SIGNATURA_ADMIN/);
	assert.doesNotMatch(source, /Dev Admin/);
});

test('homepage login navigates directly to passkey login page', async () => {
	const source = await readFile(
		new URL('../src/app/page.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /href="\/login\?next=\/signatura\/dashboard"/);
	assert.doesNotMatch(source, /HomeLoginModal/);
});

test('public registration does not expose admin account selection', async () => {
	const registerPage = await readFile(
		new URL('../src/app/register/page.js', import.meta.url),
		'utf8',
	);
	const registerForm = await readFile(
		new URL('../src/components/RegisterPasskeyForm.js', import.meta.url),
		'utf8',
	);

	assert.doesNotMatch(registerPage, /requestedAccountType === 'admin'/);
	assert.doesNotMatch(registerForm, /Account class/);
	assert.doesNotMatch(registerForm, /SIG-A-XXXX-XXXX/);
	assert.match(registerForm, /Create issuer Signatura ID/);
});

test('ACCURA-linked registration shows company context and hides issuer link', async () => {
	const registerPage = await readFile(
		new URL('../src/app/register/page.js', import.meta.url),
		'utf8',
	);
	const registerForm = await readFile(
		new URL('../src/components/RegisterPasskeyForm.js', import.meta.url),
		'utf8',
	);
	const accuraRegisterPage = await readFile(
		new URL('../src/app/register/accura/page.js', import.meta.url),
		'utf8',
	);
	const loginPage = await readFile(
		new URL('../src/app/login/page.js', import.meta.url),
		'utf8',
	);
	const appInstallPage = await readFile(
		new URL('../src/app/app/page.js', import.meta.url),
		'utf8',
	);
	const accuraLinkForm = await readFile(
		new URL('../src/components/AccuraOnboardingLinkForm.js', import.meta.url),
		'utf8',
	);
	const appApprovalPage = await readFile(
		new URL('../src/app/app-approval/page.js', import.meta.url),
		'utf8',
	);
	const appApprovalInstallGate = await readFile(
		new URL('../src/components/AppApprovalInstallGate.js', import.meta.url),
		'utf8',
	);
	const appApprovalApi = await readFile(
		new URL('../src/app/api/signatura/app-approval/approve/route.ts', import.meta.url),
		'utf8',
	);
	const appApprovalForm = await readFile(
		new URL('../src/components/AppApprovalForm.js', import.meta.url),
		'utf8',
	);
	const registerRoute = await readFile(
		new URL('../src/app/api/auth/register/account/route.ts', import.meta.url),
		'utf8',
	);
	const schema = await readFile(
		new URL('../prisma/schema.prisma', import.meta.url),
		'utf8',
	);

	assert.match(registerPage, /registrationContextFromParams/);
	assert.match(registerPage, /validateAccuraRegistrationContext/);
	assert.match(registerPage, /registrationContextError/);
	assert.match(registerPage, /ACCURA registration link is outdated/);
	assert.match(registerPage, /validateAccuraRegistrationContext/);
	assert.match(registerPage, /registrationContext\.source !== 'accura'/);
	assert.match(accuraRegisterPage, /verifyAccuraRegistrationHandoffToken/);
	assert.match(accuraRegisterPage, /accuraRegistrationContextForForm/);
	assert.match(accuraRegisterPage, /params\?\.challengeId/);
	assert.match(accuraRegisterPage, /params\?\.handoffId/);
	assert.match(accuraRegisterPage, /externalChallengeId/);
	assert.match(accuraRegisterPage, /OR: \[\{ tokenId: context\.tokenId \}, \{ challengeId \}\]/);
	assert.match(appInstallPage, /challengeId: firstParam\(params\?\.challengeId\)/);
	assert.match(appInstallPage, /flowType: firstParam\(params\?\.flowType\)/);
	assert.match(loginPage, /accuraHandoffFromSearchParams/);
	assert.match(loginPage, /isAccuraApprovalPath/);
	assert.match(loginPage, /redirect\(accuraHandoff\.registerPath\)/);
	assert.match(loginPage, /redirect\(nextPath\)/);
	assert.match(accuraRegisterPage, /ACCURA registration session expired/);
	assert.match(accuraRegisterPage, /ACCURA_ONBOARDING_ACTIONS/);
	assert.match(accuraRegisterPage, /existingReadyIdentity/);
	assert.match(accuraRegisterPage, /requireSession/);
	assert.match(accuraRegisterPage, /recoveryCode\.count/);
	assert.match(accuraRegisterPage, /trustedDevice\.count/);
	assert.match(accuraRegisterPage, /linkSignaturaId: readyIdentity\.signaturaId/);
	assert.match(accuraRegisterPage, /AccuraOnboardingLinkForm/);
	assert.match(accuraLinkForm, /Existing Signatura Identity Found/);
	assert.match(accuraLinkForm, /Universal ID/);
	assert.match(accuraLinkForm, /Application:.*ACCURA/s);
	assert.match(accuraLinkForm, /Requested Role/);
	assert.match(accuraLinkForm, /No new identity will be created/);
	assert.match(accuraLinkForm, /SYSTEM_ADMIN/);
	assert.match(accuraLinkForm, /'Approve'/);
	assert.match(accuraLinkForm, /Cancel/);
	assert.match(accuraLinkForm, /approvedCrossDevice/);
	assert.match(accuraLinkForm, /challengeId/);
	assert.match(accuraLinkForm, /body: JSON\.stringify\(\{[\s\S]*challengeId/);
	assert.match(accuraLinkForm, /Approved\. Return to your ACCURA browser\./);
	assert.match(accuraLinkForm, /The original ACCURA browser window will continue automatically/);
	assert.match(accuraLinkForm, /callbackFailed/);
	assert.match(accuraLinkForm, /Approved locally, but ACCURA callback failed/);
	assert.match(appApprovalPage, /AppApprovalForm/);
	assert.match(appApprovalPage, /AppApprovalInstallGate/);
	assert.match(appApprovalPage, /\/register\?next=/);
	assert.match(appApprovalPage, /SIG-U-/);
	assert.match(appApprovalPage, /normalizeCompanyCode/);
	assert.match(appApprovalPage, /companyCode/);
	assert.doesNotMatch(appApprovalPage, /redirect\(`\/register\?next=/);
	assert.match(appApprovalInstallGate, /getInstalledRelatedApps/);
	assert.match(appApprovalInstallGate, /display-mode: standalone/);
	assert.match(appApprovalInstallGate, /beforeinstallprompt/);
	assert.match(appApprovalInstallGate, /Install Signatura to approve/);
	assert.match(appApprovalInstallGate, /Create or Open Signatura ID/);
	assert.match(appApprovalApi, /challengeId/);
	assert.match(appApprovalApi, /status: 'APPROVED'/);
	assert.match(appApprovalApi, /verificationToken/);
	assert.match(appApprovalApi, /approvedAt/);
	assert.match(appApprovalApi, /HIGH_RISK_ROLES/);
	assert.match(appApprovalApi, /verifyAuthenticationResponse/);
	assert.match(appApprovalApi, /Passkey approval is required for this ACCURA role/);
	assert.match(appApprovalApi, /authenticationMethod/);
	assert.match(appApprovalApi, /deviceId/);
	assert.match(appApprovalApi, /app_approval_completed/);
	assert.match(appApprovalApi, /ensureAccuraMembershipRole/);
	assert.match(appApprovalApi, /ACCURA company code is required for this role/);
	assert.match(appApprovalApi, /resolvedCompanyCode/);
	assert.doesNotMatch(appApprovalApi, /companyCode: 'ACCURA'/);
	assert.match(appApprovalForm, /startAuthentication/);
	assert.match(appApprovalForm, /HIGH_RISK_ROLES/);
	assert.match(appApprovalApi, /notifyAccuraAppApprovalCallback/);
	assert.match(appApprovalForm, /app-approval\/sync-callback/);
	assert.match(appApprovalForm, /Company Code/);
	assert.match(appApprovalForm, /companyCode/);
	assert.match(appApprovalForm, /Approved locally, but ACCURA callback failed/);
	assert.match(accuraLinkForm, /Approved\. Return to your ACCURA browser\./);
	assert.match(registerForm, /Link your SIGNATURA ID to ACCURA/);
	assert.match(registerForm, /Registering for ACCURA company access/);
	assert.match(registerForm, /canShowIssuerRegistrationLink/);
	assert.match(registerForm, /Boolean\(showIssuerRegistrationLink\) && !isAccuraRegistration/);
	assert.match(registerForm, /ACCURA Company Name/);
	assert.match(registerForm, /ACCURA Company Code/);
	assert.match(registerForm, /Assigned Role/);
	assert.match(registerForm, /Role Prefix/);
	assert.match(registerForm, /stored as a separate authorization under the same identity/);
	assert.match(registerForm, /accuraHandoffToken/);
	assert.match(registerForm, /role: isAccuraRegistration \? '' : accuraRole/);
	assert.match(registerForm, /rolePrefix: isAccuraRegistration \? '' : accuraRolePrefix/);
	assert.match(registerRoute, /createSignaturaIdentity/);
	assert.doesNotMatch(registerRoute, /createUniqueSignaturaId/);
	assert.match(registerRoute, /validateAccuraRegistrationContext/);
	assert.match(registerRoute, /verifyAccuraRegistrationHandoffToken/);
	assert.match(registerRoute, /signaturaAppLinkModel/);
	assert.match(registerRoute, /appLinkModel\.create/);
	assert.match(registerRoute, /existingSignaturaId/);
	assert.match(registerRoute, /linkedToCompany/);
	assert.match(registerRoute, /ensureAccuraMembershipRole/);
	assert.match(schema, /model SignaturaAppLink/);
	assert.match(schema, /model AccuraRegistrationHandoff/);
	assert.match(schema, /rolePrefix\s+String\?/);
	assert.match(
		schema,
		/@@unique\(\[userId, sourceApp, companyId, rolePrefix\]\)/,
	);
	const appLinkSchema = schema.match(
		/model SignaturaAppLink \{[\s\S]*?\n\}/,
	)?.[0];
	assert.match(appLinkSchema || '', /signaturaId\s+String\s+@map\("signatura_id"\)/);
	assert.doesNotMatch(appLinkSchema || '', /signaturaId\s+String\s+@unique/);
});

test('ACCURA callback receives signed source and company registration status', async () => {
	const registerForm = await readFile(
		new URL('../src/components/RegisterPasskeyForm.js', import.meta.url),
		'utf8',
	);
	const activateRoute = await readFile(
		new URL('../src/app/api/auth/register/activate/route.ts', import.meta.url),
		'utf8',
	);

	assert.match(registerForm, /data\.accuraReturnUrl/);
	assert.match(registerForm, /serverReturnUrl/);
	assert.match(registerForm, /if \(isAccuraRegistration\) return ''/);
	assert.match(activateRoute, /buildAccuraRegistrationReturnUrl/);
	assert.match(activateRoute, /ensureAccuraMembershipRole/);
	assert.match(activateRoute, /registrationStatus: 'SUCCESS'/);
	assert.match(activateRoute, /accuraRegistrationKeyId/);
});

test('ACCURA duplicate registration displays existing Signatura ID', async () => {
	const registerForm = await readFile(
		new URL('../src/components/RegisterPasskeyForm.js', import.meta.url),
		'utf8',
	);

	assert.match(registerForm, /Existing SIGNATURA ID/);
	assert.match(registerForm, /existingAccount\.signaturaId/);
	assert.match(registerForm, /Continue in ACCURA/);
	assert.match(registerForm, /registrationStatus'.*existing/s);
	assert.match(
		registerForm,
		/Use this existing Signatura ID and approve biometric linking/,
	);
	assert.match(registerForm, /Link this ACCURA role/);
	assert.match(registerForm, /linkExistingIdentityToAccura/);
});

test('ACCURA registration lookup is scoped by app company role and contact', async () => {
	const registerRoute = await readFile(
		new URL('../src/app/api/auth/register/account/route.ts', import.meta.url),
		'utf8',
	);

	assert.match(registerRoute, /const isAccuraRegistration = registrationSource\.source === 'accura'/);
	assert.match(registerRoute, /matchingContactUserIds/);
	assert.match(registerRoute, /userId: \{ in: matchingContactUserIds \}/);
	assert.match(registerRoute, /sourceApp: 'ACCURA'/);
	assert.match(registerRoute, /companyCode,/);
	assert.match(registerRoute, /rolePrefix/);
	assert.match(registerRoute, /tokenId/);
	assert.match(registerRoute, /ACCURA company-role Signatura ID already exists/);
	assert.match(registerRoute, /linkRequired: true/);
	assert.match(registerRoute, /createSignaturaIdentity/);
	assert.match(registerRoute, /accuraChallengeId/);
	assert.match(registerRoute, /ensureAccuraMembershipRole/);
	assert.doesNotMatch(registerRoute, /createUniqueSignaturaId/);
	assert.doesNotMatch(registerRoute, /createUniqueAccuraSignaturaId/);
	assert.match(registerRoute, /masterSignaturaId/);
});

test('registration cancel and back always return to login page', async () => {
	const source = await readFile(
		new URL('../src/components/RegisterPasskeyForm.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /function returnToLogin\(\)/);
	assert.match(source, /router\.push\(loginHref\)/);
	assert.doesNotMatch(source, /openLogin=1/);
	assert.doesNotMatch(source, /isStandalonePwa/);
});

test('device setup resume offers create account and login return', async () => {
	const source = await readFile(
		new URL('../src/components/RegisterPasskeyForm.js', import.meta.url),
		'utf8',
	);
	const resumeSection = source.slice(
		source.indexOf("{step === 'resume'"),
		source.indexOf("{step === 'passkey'"),
	);

	assert.match(resumeSection, /Create new Signatura account/);
	assert.match(resumeSection, /startNewAccountRegistration/);
	assert.match(resumeSection, /Back to login/);
	assert.match(source, /clearStoredTrustedDeviceSignaturaId/);
});

test('duplicate user registration returns existing Signatura ID and setup state', async () => {
	const registerRoute = await readFile(
		new URL('../src/app/api/auth/register/account/route.ts', import.meta.url),
		'utf8',
	);
	const registerForm = await readFile(
		new URL('../src/components/RegisterPasskeyForm.js', import.meta.url),
		'utf8',
	);

	assert.match(
		registerRoute,
		/A Signatura identity already exists[\s\S]+existingSignaturaId: existing\.signaturaId[\s\S]+setupIncomplete[\s\S]+linkRequired: true/,
	);
	assert.match(registerForm, /setupIncomplete/);
	assert.match(registerForm, /Continue setup/);
	assert.match(registerForm, /Clearing browser data does not remove your account/);
	assert.match(registerForm, /Register this device/);
});

test('admin registration uses a separate admin URL', async () => {
	const loginForm = await readFile(
		new URL('../src/components/LoginPasskeyForm.js', import.meta.url),
		'utf8',
	);
	const adminRegisterPage = await readFile(
		new URL('../src/app/admin/register/page.js', import.meta.url),
		'utf8',
	);
	const adminLoginPage = await readFile(
		new URL('../src/app/admin/login/page.js', import.meta.url),
		'utf8',
	);
	const adminLayout = await readFile(
		new URL('../src/app/admin/layout.js', import.meta.url),
		'utf8',
	);
	const registerForm = await readFile(
		new URL('../src/components/RegisterPasskeyForm.js', import.meta.url),
		'utf8',
	);
	const registerRoute = await readFile(
		new URL('../src/app/api/auth/register/account/route.ts', import.meta.url),
		'utf8',
	);

	assert.match(loginForm, /\/admin\/register\?next=/);
	assert.match(adminRegisterPage, /initialAccountType="admin"/);
	assert.match(adminRegisterPage, /href="\/admin\/login\?next=\/admin"/);
	assert.match(adminLoginPage, /LoginPasskeyForm nextPath=\{nextPath\}/);
	assert.match(adminLoginPage, /\/admin\/register\?next=/);
	assert.match(adminLayout, /pathname === '\/admin\/login'/);
	assert.match(adminLayout, /pathname === '\/admin\/register'/);
	assert.match(registerForm, /adminProvisioningSecret/);
	assert.match(registerForm, /ADMIN_PROVISIONING_SECRET/);
	assert.match(registerRoute, /process\.env\.ADMIN_PROVISIONING_SECRET/);
	assert.match(registerRoute, /Invalid admin provisioning secret/);
});
