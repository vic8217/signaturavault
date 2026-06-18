import { normalizeSignaturaId } from '@/lib/identity';

function queryValue(params, key) {
	const value = params?.[key];
	return Array.isArray(value) ? value[0] || '' : value || '';
}

function buildRemoteApprovePath({ challengeId, shortCode, signaturaId = '' }) {
	const params = new URLSearchParams();
	params.set('cid', challengeId);
	params.set('code', shortCode);
	const normalizedSignaturaId = normalizeSignaturaId(signaturaId);
	if (normalizedSignaturaId) {
		params.set('signaturaId', normalizedSignaturaId);
	}
	return `/login/remote-approve?${params.toString()}`;
}

function buildApproverLoginRedirect({
	challengeId,
	shortCode,
	signaturaId,
	switchAccount = false,
}) {
	const remoteApprovePath = buildRemoteApprovePath({
		challengeId,
		shortCode,
		signaturaId,
	});
	const loginParams = new URLSearchParams();
	const normalizedSignaturaId = normalizeSignaturaId(signaturaId);
	if (normalizedSignaturaId) {
		loginParams.set('signaturaId', normalizedSignaturaId);
	}
	loginParams.set('next', remoteApprovePath);
	const loginPath = `/login?${loginParams.toString()}`;
	if (!switchAccount) {
		return loginPath;
	}
	return `/api/auth/logout?redirect=${encodeURIComponent(loginPath)}`;
}

export {
	buildApproverLoginRedirect,
	buildRemoteApprovePath,
	queryValue,
};
