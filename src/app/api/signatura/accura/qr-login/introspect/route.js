import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { normalizeCompanyCode } from '@/lib/registrationSource';

function safeEqual(left, right) {
	const a = Buffer.from(String(left || ''));
	const b = Buffer.from(String(right || ''));
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function inactive(reason, status = 200, extra = {}) {
	return Response.json({ active: false, reason, ...extra }, { status });
}

function basicCredentials(req) {
	const authorization = String(req.headers.get('authorization') || '');
	if (!authorization.toLowerCase().startsWith('basic ')) return {};
	try {
		const decoded = Buffer.from(authorization.slice(6).trim(), 'base64').toString('utf8');
		const separator = decoded.indexOf(':');
		if (separator < 0) return {};
		return {
			clientId: decoded.slice(0, separator),
			clientSecret: decoded.slice(separator + 1),
		};
	} catch {
		return {};
	}
}

function qrProofSecret() {
	return (
		process.env.ACCURA_CLIENT_SECRET?.trim() ||
		process.env.SIGNATURA_CLIENT_SECRET?.trim() ||
		process.env.SESSION_SECRET?.trim() ||
		''
	);
}

function verifyProof(value) {
	const [encoded, signature, extra] = String(value || '').split('.');
	const secret = qrProofSecret();
	if (!encoded || !signature || extra || !secret) return null;
	const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
	if (!safeEqual(signature, expected)) return null;
	try {
		const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
		if (
			payload?.typ !== 'signatura.accura.qr_login_approval' ||
			payload?.app !== 'ACCURA' ||
			payload?.v !== 1
		) {
			return null;
		}
		return payload;
	} catch {
		return null;
	}
}

export async function POST(req) {
	try {
		const credentials = basicCredentials(req);
		const expectedClientId =
			process.env.ACCURA_CLIENT_ID?.trim() ||
			process.env.SIGNATURA_CLIENT_ID?.trim() ||
			'accura';
		const expectedSecret = qrProofSecret();
		if (
			!expectedSecret ||
			!credentials.clientId ||
			!credentials.clientSecret ||
			!safeEqual(credentials.clientId, expectedClientId) ||
			!safeEqual(credentials.clientSecret, expectedSecret)
		) {
			return inactive('invalid_client', 401);
		}

		const body = await req.json().catch(() => ({}));
		const proof = verifyProof(
			body.challengeId ||
				body.assertion ||
				body.signaturaAssertion ||
				body.signatura_assertion,
		);
		if (!proof) return inactive('invalid_qr_approval_proof', 401);

		const expectedSignaturaId = String(
			body.expectedSignaturaId || body.expected_signatura_id || '',
		)
			.trim()
			.toUpperCase();
		if (!expectedSignaturaId || proof.signaturaId !== expectedSignaturaId) {
			return inactive('signatura_id_mismatch');
		}
		const approvedAt = Date.parse(String(proof.approvedAt || ''));
		if (!Number.isFinite(approvedAt) || Math.abs(Date.now() - approvedAt) > 2 * 60 * 1000) {
			return inactive('expired');
		}

		const link = await prisma.signaturaAppLink.findFirst({
			where: {
				id: String(proof.walletAccountId || ''),
				signaturaId: proof.signaturaId,
				sourceApp: 'ACCURA',
				status: 'ACTIVE',
			},
			include: {
				user: {
					select: { id: true, signaturaId: true, accountStatus: true },
				},
			},
		});
		if (!link || !link.user) return inactive('accura_link_not_found', 404);
		if (link.user.accountStatus !== 'active') return inactive('account_inactive');
		if (link.signaturaId !== proof.signaturaId) return inactive('signatura_id_mismatch');
		if (link.rolePrefix !== (proof.rolePrefix || null)) {
			return inactive('accura_link_mismatch');
		}
		const linkCompanyCode = normalizeCompanyCode(link.companyCode);
		const proofCompanyCode = normalizeCompanyCode(proof.companyCode);
		if (
			linkCompanyCode &&
			proofCompanyCode &&
			linkCompanyCode !== proofCompanyCode
		) {
			return inactive('accura_link_mismatch');
		}
		if (
			link.trustedDeviceStatus &&
			String(link.trustedDeviceStatus).toUpperCase() !== 'TRUSTED'
		) {
			return inactive('untrusted_device', 200, { trustedDevice: false });
		}

		return Response.json({
			active: true,
			subject: link.user.id,
			signaturaId: link.signaturaId,
			rolePrefix: link.rolePrefix,
			companyCode: link.companyCode,
			companyId: link.companyId,
			tenantId: link.tenantId || link.companyId,
			accuraUserId: link.accuraUserId,
			identityVerified: true,
			trustedDevice: true,
			keyUnlocked: true,
			sessionType: 'accura-qr-login',
			clientId: expectedClientId,
			sourceApp: 'ACCURA',
			expiresAt: new Date(approvedAt + 2 * 60 * 1000).toISOString(),
		});
	} catch {
		return inactive('qr_introspection_failed', 400);
	}
}
