import crypto from 'crypto';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { prisma } from '@/lib/prisma';
import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { requireSession } from '@/lib/session';
import {
	normalizeApp,
	normalizeChallengeId,
	normalizeFlowType,
	normalizeRole,
} from '@/lib/signaturaAppApprovalQr';
import { ensureAccuraMembershipRole } from '@/lib/universalIdentity';
import {
	assertSecureWebAuthnRequest,
	getOrigin,
	getRpID,
	logSecurityEvent,
} from '@/lib/webauthn';

const HIGH_RISK_ROLES = new Set([
	'SYSTEM_ADMIN',
	'COMPANY_ADMIN',
	'INVOICE_ISSUER',
	'ACCOUNTING_ADMIN',
	'HR_ADMIN',
	'PAYROLL_ADMIN',
]);

function rolePrefixForRequestedRole(role: string) {
	if (role === 'SYSTEM_ADMIN') return 'SADM';
	if (role === 'COMPANY_ADMIN') return 'CADM';
	if (role === 'STAFF') return 'STAF';
	return role.slice(0, 8) || 'STAF';
}

function normalizeCallbackUrl(value: unknown) {
	const raw = String(value || '').trim();
	if (!raw) return '';
	try {
		const url = new URL(raw);
		if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
		return url.toString();
	} catch {
		return '';
	}
}

async function postApprovalCallback({
	callbackUrl,
	challengeId,
	signaturaId,
	verificationToken,
	approvedAt,
}: {
	callbackUrl: string;
	challengeId: string;
	signaturaId: string;
	verificationToken: string;
	approvedAt: string;
}) {
	if (!callbackUrl) return { ok: false, skipped: true };
	const body = {
		challengeId,
		signaturaId,
		status: 'APPROVED',
		verificationToken,
		approvedAt,
	};
	console.info('[signatura.app_approval.callback.sending]', {
		challengeId,
		callbackUrl,
	});
	try {
		const response = await fetch(callbackUrl, {
			method: 'POST',
			cache: 'no-store',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		});
		const responseBody = await response.text().catch(() => '');
		console.info('[signatura.app_approval.callback.response]', {
			challengeId,
			callbackUrl,
			status: response.status,
			ok: response.ok,
			body: responseBody.slice(0, 2000),
		});
		return {
			ok: response.ok,
			status: response.status,
			body: responseBody,
		};
	} catch (error) {
		console.warn('[signatura.app_approval.callback.failed]', {
			challengeId,
			callbackUrl,
			error: error instanceof Error ? error.message : 'fetch_failed',
		});
		return {
			ok: false,
			error: error instanceof Error ? error.message : 'fetch_failed',
		};
	}
}

export async function POST(req: Request) {
	try {
		assertSecureWebAuthnRequest(req);
		const session = await requireSession();
		if (
			!session?.userId ||
			session.accountStatus !== 'active' ||
			Number(session.trustLevel || 0) < 2 ||
			!String(session.signaturaId || '').startsWith('SIG-U-')
		) {
			return jsonError('A verified Universal Signatura ID is required', 401);
		}

		const body = await req.json().catch(() => ({}));
		const challengeId = normalizeChallengeId(body.challengeId);
		const app = normalizeApp(body.app);
		const requestedRole = normalizeRole(body.requestedRole || body.role);
		const flowType = normalizeFlowType(body.flowType);
		const callbackUrl = normalizeCallbackUrl(body.callbackUrl);
		const assertion = body.response || body.assertion || null;
		if (!challengeId) return jsonError('challengeId is required', 400);
		if (app !== 'ACCURA') return jsonError('Unsupported application approval app', 400);
		if (!requestedRole) return jsonError('requestedRole is required', 400);
		if (!callbackUrl) return jsonError('callbackUrl is required', 400);

		const rolePrefix = rolePrefixForRequestedRole(requestedRole);
		const isHighRisk = HIGH_RISK_ROLES.has(requestedRole);
		let authenticationMethod = 'trusted_session';
		let deviceId = '';
		if (isHighRisk) {
			if (!assertion) {
				await logSecurityEvent(req, 'app_approval_step_up_failed', session.userId, {
					signaturaId: session.signaturaId,
					app,
					requestedRole,
					challengeId,
					result: 'FAILED',
					reason: 'missing_assertion',
				});
				return jsonError('Passkey approval is required for this ACCURA role', 401);
			}

			const authChallenge = await prisma.authChallenge.findFirst({
				where: {
					userId: session.userId,
					type: 'LOGIN_PASSKEY',
					usedAt: null,
					expiresAt: { gt: new Date() },
				},
				orderBy: { createdAt: 'desc' },
			});
			if (!authChallenge) {
				await logSecurityEvent(req, 'app_approval_step_up_failed', session.userId, {
					signaturaId: session.signaturaId,
					app,
					requestedRole,
					challengeId,
					result: 'FAILED',
					reason: 'missing_challenge',
				});
				return jsonError('Passkey login challenge expired. Start again.', 401);
			}

			const credential = await prisma.webAuthnCredential.findFirst({
				where: {
					userId: session.userId,
					credentialId: String(assertion?.id || ''),
				},
			});
			if (!credential || !credential.isTrusted) {
				await logSecurityEvent(req, 'app_approval_step_up_failed', session.userId, {
					signaturaId: session.signaturaId,
					app,
					requestedRole,
					challengeId,
					result: 'FAILED',
					reason: 'untrusted_credential',
				});
				return jsonError('No trusted passkey is registered for this account', 401);
			}

			const verification = await verifyAuthenticationResponse({
				response: assertion,
				expectedChallenge: authChallenge.challenge,
				expectedOrigin: getOrigin(req),
				expectedRPID: getRpID(req),
				requireUserVerification: true,
				credential: {
					id: credential.credentialId,
					publicKey: credential.publicKey,
					counter: credential.counter,
					transports: credential.transports as never,
				},
			});
			if (!verification.verified) {
				await logSecurityEvent(req, 'app_approval_step_up_failed', session.userId, {
					signaturaId: session.signaturaId,
					app,
					requestedRole,
					challengeId,
					deviceId: credential.id,
					result: 'FAILED',
					reason: 'verification_failed',
				});
				return jsonError('Passkey approval could not be verified', 401);
			}
			const now = new Date();
			await prisma.$transaction([
				prisma.authChallenge.update({
					where: { id: authChallenge.id },
					data: { usedAt: now },
				}),
				prisma.webAuthnCredential.update({
					where: { id: credential.id },
					data: {
						counter: verification.authenticationInfo.newCounter,
						lastUsedAt: now,
					},
				}),
			]);
			authenticationMethod = 'webauthn_passkey';
			deviceId = credential.id;
		}

		const verificationToken = crypto.randomBytes(32).toString('base64url');
		const approvedAt = new Date().toISOString();

		await prisma.$transaction(async (tx) => {
			const existingLink = await tx.signaturaAppLink.findFirst({
				where: {
					userId: session.userId,
					sourceApp: 'ACCURA',
					companyCode: 'ACCURA',
					rolePrefix,
					status: 'ACTIVE',
				},
				orderBy: { createdAt: 'desc' },
			});

			const registrationContext = {
				sourceApp: 'accura',
				challengeId,
				requestedRole,
				flowType,
				callbackUrl,
				approvedAt,
				authenticationMethod,
				deviceId,
				masterSignaturaId: session.signaturaId,
			};

			if (existingLink) {
				await tx.signaturaAppLink.update({
					where: { id: existingLink.id },
					data: {
						signaturaId: session.signaturaId,
						registrationContext,
						trustedDeviceStatus: 'TRUSTED',
					},
				});
			} else {
				await tx.signaturaAppLink.create({
					data: {
						id: crypto.randomUUID(),
						userId: session.userId,
						signaturaId: session.signaturaId,
						sourceApp: 'ACCURA',
						companyCode: 'ACCURA',
						companyName: 'ACCURA',
						companyId: 'accura-platform',
						tenantId: 'accura-platform',
						role: requestedRole,
						rolePrefix,
						registrationContext,
						trustedDeviceStatus: 'TRUSTED',
						status: 'ACTIVE',
					},
				});
			}

			await ensureAccuraMembershipRole(tx, {
				identityId: session.userId,
				companyId: 'accura-platform',
				companyCode: 'ACCURA',
				companyName: 'ACCURA',
				rolePrefix,
				roleName: requestedRole,
			});
		});

		const callback = await postApprovalCallback({
			callbackUrl,
			challengeId,
			signaturaId: session.signaturaId,
			verificationToken,
			approvedAt,
		});

		await logSecurityEvent(req, 'app_approval_completed', session.userId, {
			signaturaId: session.signaturaId,
			app,
			requestedRole,
			challengeId,
			approvalTime: approvedAt,
			authenticationMethod,
			deviceId,
			result: callback.ok === false ? 'CALLBACK_FAILED' : 'SUCCESS',
		});

		return Response.json({
			ok: true,
			status: 'APPROVED',
			challengeId,
			signaturaId: session.signaturaId,
			verificationToken,
			approvedAt,
			flowType,
			callback,
			message: `Approved. Return to your ${app} browser.`,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to approve app request'),
			400,
		);
	}
}
