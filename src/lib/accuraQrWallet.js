import { prisma } from './prisma';

async function listActiveAccuraWalletAccounts(userId) {
	const links = await prisma.signaturaAppLink.findMany({
		where: {
			userId,
			sourceApp: 'ACCURA',
			status: 'ACTIVE',
		},
		orderBy: { createdAt: 'asc' },
	});

	return links.map((link) => ({
		id: link.id,
		app: 'ACCURA',
		signaturaId: link.signaturaId,
		companyCode: link.companyCode || '',
		rolePrefix: link.rolePrefix || '',
		displayName:
			link.companyName && link.role
				? `${link.companyName} · ${link.role}`
				: link.role || link.companyName || link.signaturaId,
		active: link.status === 'ACTIVE',
		trustedDeviceStatus: link.trustedDeviceStatus || null,
	}));
}

async function requireActiveAccuraWalletAccount({ userId, walletAccountId, signaturaId }) {
	const link = await prisma.signaturaAppLink.findFirst({
		where: {
			userId,
			sourceApp: 'ACCURA',
			status: 'ACTIVE',
			...(walletAccountId ? { id: walletAccountId } : {}),
			...(signaturaId ? { signaturaId } : {}),
		},
	});
	if (!link) {
		const error = new Error(
			'No active ACCURA Signatura ID was found in this wallet.',
		);
		error.status = 403;
		throw error;
	}
	return link;
}

export {
	listActiveAccuraWalletAccounts,
	requireActiveAccuraWalletAccount,
};
