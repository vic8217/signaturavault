const APP_APPROVAL_TYPE = 'SIGNATURA_APP_APPROVAL';
const SUPPORTED_APPS = new Set(['ACCURA']);
const SUPPORTED_FLOW_TYPES = new Set(['cross_device_qr', 'same_device_deeplink']);

function normalizeChallengeId(value) {
	return String(value || '').trim().slice(0, 200);
}

function normalizeApp(value) {
	return String(value || '').trim().toUpperCase();
}

function normalizeRole(value) {
	return String(value || '')
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, '_')
		.replace(/^_|_$/g, '')
		.slice(0, 80);
}

function normalizeFlowType(value) {
	const flowType = String(value || 'cross_device_qr').trim().toLowerCase();
	return SUPPORTED_FLOW_TYPES.has(flowType) ? flowType : 'cross_device_qr';
}

function normalizeCallbackUrl(value) {
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

function appApprovalPath(approval) {
	const params = new URLSearchParams({
		challengeId: normalizeChallengeId(approval.challengeId),
		app: normalizeApp(approval.app),
		requestedRole: normalizeRole(approval.requestedRole || approval.role),
		flowType: normalizeFlowType(approval.flowType),
	});
	const callbackUrl = normalizeCallbackUrl(approval.callbackUrl);
	if (callbackUrl) params.set('callbackUrl', callbackUrl);
	return `/app-approval?${params.toString()}`;
}

function validApprovalPayload(payload) {
	const challengeId = normalizeChallengeId(payload.challengeId);
	const app = normalizeApp(payload.app);
	const requestedRole = normalizeRole(payload.requestedRole || payload.role);
	const callbackUrl = normalizeCallbackUrl(payload.callbackUrl);
	if (!challengeId || !SUPPORTED_APPS.has(app) || !requestedRole || !callbackUrl) {
		return null;
	}
	return {
		type: APP_APPROVAL_TYPE,
		version: 1,
		challengeId,
		app,
		requestedRole,
		flowType: normalizeFlowType(payload.flowType),
		callbackUrl,
	};
}

function parseSignaturaAppApprovalQr(payload) {
	const raw = String(payload || '').trim();
	if (!raw) {
		return { valid: false, reason: 'missing_payload', error: 'QR code is empty.' };
	}

	try {
		const parsed = JSON.parse(raw);
		if (String(parsed?.type || '') !== APP_APPROVAL_TYPE) {
			return {
				valid: false,
				reason: 'wrong_type',
				error: 'This QR code is not a Signatura app approval request.',
			};
		}
		if (Number(parsed.version || 0) !== 1) {
			return {
				valid: false,
				reason: 'unsupported_version',
				error: 'This Signatura app approval QR version is not supported.',
			};
		}
		const approval = validApprovalPayload(parsed);
		if (!approval) {
			return {
				valid: false,
				reason: 'invalid_payload',
				error: 'This Signatura app approval QR is missing required fields.',
			};
		}
		return { valid: true, ...approval, href: appApprovalPath(approval) };
	} catch {
		// Try URL format below.
	}

	try {
		const url = new URL(raw);
		const path = url.pathname.replace(/\/+$/, '').toLowerCase();
		if (path !== '/app-approval') {
			return {
				valid: false,
				reason: 'invalid_route',
				error: 'This QR code is not a Signatura app approval request.',
			};
		}
		const approval = validApprovalPayload({
			challengeId: url.searchParams.get('challengeId'),
			app: url.searchParams.get('app'),
			requestedRole:
				url.searchParams.get('requestedRole') || url.searchParams.get('role'),
			flowType: url.searchParams.get('flowType'),
			callbackUrl: url.searchParams.get('callbackUrl'),
		});
		if (!approval) {
			return {
				valid: false,
				reason: 'invalid_payload',
				error: 'This Signatura app approval QR is missing required fields.',
			};
		}
		return { valid: true, ...approval, href: appApprovalPath(approval) };
	} catch {
		return {
			valid: false,
			reason: 'invalid_format',
			error: 'This QR code is not a Signatura app approval request.',
		};
	}
}

export {
	APP_APPROVAL_TYPE,
	appApprovalPath,
	normalizeApp,
	normalizeChallengeId,
	normalizeFlowType,
	normalizeRole,
	parseSignaturaAppApprovalQr,
};
