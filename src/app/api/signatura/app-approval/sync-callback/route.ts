import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { notifyAccuraAppApprovalCallback } from '@/lib/accuraRegistrationHandoff';
import { requireSession } from '@/lib/session';
import {
	normalizeChallengeId,
	normalizeCompanyCode,
	normalizeCompanyId,
	normalizeCompanyName,
	normalizeRole,
} from '@/lib/signaturaAppApprovalQr';

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

export async function POST(req: Request) {
	try {
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
		const callbackUrl = normalizeCallbackUrl(body.callbackUrl);
		const companyId = normalizeCompanyId(body.companyId || body.company_id);
		const companyCode = normalizeCompanyCode(body.companyCode || body.company_code);
		const companyName = normalizeCompanyName(body.companyName || body.company_name);
		const requestedRole = normalizeRole(body.requestedRole || body.role);
		const signaturaId = String(body.signaturaId || session.signaturaId || '')
			.trim()
			.toUpperCase();
		const verificationToken = String(body.verificationToken || '').trim();
		const approvedAt = String(body.approvedAt || new Date().toISOString());

		if (!challengeId) return jsonError('challengeId is required', 400);
		if (!callbackUrl) return jsonError('callbackUrl is required', 400);
		if (!verificationToken) return jsonError('verificationToken is required', 400);

		const callback = await notifyAccuraAppApprovalCallback({
			callbackUrl,
			challengeId,
			signaturaId,
			verificationToken,
			approvedAt,
			companyId,
			companyCode,
			companyName,
			requestedRole,
		});

		return Response.json({
			ok: callback.ok === true,
			callback,
		});
	} catch (error) {
		return jsonError(
			safeApiErrorMessage(error, 'Unable to sync ACCURA approval callback'),
			400,
		);
	}
}
