import { jsonError, safeApiErrorMessage } from '@/lib/api';
import { logAuthAudit } from '@/lib/auth/authAudit';
import {
	normalizeChallengeId,
	normalizeShortCode,
} from '@/lib/accuraQrLogin';
import { fetchAccuraQrLoginChallenge } from '@/lib/accuraQrLoginService';
import { listActiveAccuraWalletAccounts } from '@/lib/accuraQrWallet';
import { requireSession } from '@/lib/session';

export async function GET(req) {
	let challengeId = '';
	let shortCode = '';
	try {
		const session = await requireSession();
		if (!session?.userId) return jsonError('Authentication required', 401);

		const url = new URL(req.url);
		challengeId = normalizeChallengeId(url.searchParams.get('challengeId'));
		shortCode = normalizeShortCode(url.searchParams.get('shortCode'));
		if (!challengeId || !shortCode) {
			return jsonError('Challenge ID and short code are required', 400);
		}

		const [challenge, allAccounts] = await Promise.all([
			fetchAccuraQrLoginChallenge({ challengeId, shortCode }),
			listActiveAccuraWalletAccounts(session.userId),
		]);
		const accounts = challenge.expectedRolePrefix
			? allAccounts.filter(
					(account) => account.rolePrefix === challenge.expectedRolePrefix,
				)
			: allAccounts;
		const matchingAccounts = challenge.expectedSignaturaId
			? accounts.filter(
					(account) => account.signaturaId === challenge.expectedSignaturaId,
				)
			: accounts;
		if (matchingAccounts.length === 0) {
			await logAuthAudit(req, 'accura_qr_login_failed', {
				userId: session.userId,
				result: 'denied',
				details: {
					challengeId,
					reason: 'required_accura_role_not_linked',
					expectedRolePrefix: challenge.expectedRolePrefix || null,
					expectedSignaturaId: challenge.expectedSignaturaId || null,
				},
			});
			return jsonError(
				challenge.expectedRolePrefix
					? `The ${challenge.expectedRolePrefix} ACCURA role is not linked to this Signatura identity.`
					: 'The requested ACCURA account is not linked to this Signatura identity.',
				403,
			);
		}
		await logAuthAudit(req, 'accura_qr_login_challenge_viewed', {
			userId: session.userId,
			details: { challengeId, accountCount: matchingAccounts.length },
		});
		return Response.json({
			ok: true,
			challenge,
			accounts: matchingAccounts,
			currentAccount: {
				signaturaId: session.signaturaId,
				rolePrefix: '',
			},
		});
	} catch (error) {
		console.warn('[signatura.accura.qr_login.challenge.failed]', {
			challengeId,
			shortCode,
			error: error instanceof Error ? error.message : 'challenge_lookup_failed',
			status: error?.status || 400,
		});
		return jsonError(
			safeApiErrorMessage(error, 'Unable to load the ACCURA login request'),
			error.status ?? 400,
		);
	}
}
