import crypto from 'crypto';
import { normalizeAccuraRolePrefix, normalizeCompanyCode } from './registrationSource';
import {
	ACCURA_QR_APP,
	buildAccuraQrApprovalPath,
	normalizeChallengeId,
	normalizeShortCode,
	parseAccuraLoginQr,
} from './accuraQrPayload';

const ACCURA_QR_LOGIN_CHALLENGE_TYPE = 'ACCURA_QR_LOGIN';

function accuraQrProofSecret() {
	const secret =
		process.env.ACCURA_CLIENT_SECRET ||
		process.env.SIGNATURA_CLIENT_SECRET ||
		process.env.SESSION_SECRET;
	if (!secret) throw new Error('ACCURA QR login proof secret is not configured');
	return secret;
}

function issueAccuraQrLoginProof(payload) {
	const proofPayload = {
		typ: 'signatura.accura.qr_login_approval',
		v: 1,
		app: ACCURA_QR_APP,
		challengeId: normalizeChallengeId(payload.challengeId),
		shortCode: normalizeShortCode(payload.shortCode),
		signaturaId: String(payload.signaturaId || '').trim().toUpperCase(),
		companyCode: normalizeCompanyCode(payload.companyCode),
		rolePrefix: normalizeAccuraRolePrefix(payload.rolePrefix),
		walletAccountId: String(payload.walletAccountId || '').trim(),
		assertionId: String(payload.assertionId || '').trim(),
		approvedAt: payload.approvedAt || new Date().toISOString(),
	};
	const encoded = Buffer.from(JSON.stringify(proofPayload)).toString('base64url');
	const signature = crypto
		.createHmac('sha256', accuraQrProofSecret())
		.update(encoded)
		.digest('base64url');
	return {
		payload: proofPayload,
		proof: `${encoded}.${signature}`,
	};
}

export {
	ACCURA_QR_APP,
	ACCURA_QR_LOGIN_CHALLENGE_TYPE,
	buildAccuraQrApprovalPath,
	issueAccuraQrLoginProof,
	normalizeChallengeId,
	normalizeShortCode,
	parseAccuraLoginQr,
};
