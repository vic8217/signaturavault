const crypto = require('crypto');

const ACCURA_APPLICATION_ID = 'accura-erp';

function requiredSecret(name) {
	const value = String(process.env[name] || '').trim();
	if (!value) throw new Error(`${name} is required to provision ACCURA Authenticator`);
	return value;
}

function authenticatorClientSecretHash(clientSecret, pepper) {
	return crypto.createHmac('sha256', pepper).update(clientSecret).digest('hex');
}

async function ensureAccuraAuthenticatorApplication(prisma) {
	const pepper = requiredSecret('AUTHENTICATOR_CLIENT_PEPPER');
	const clientSecret = requiredSecret('ACCURA_CLIENT_SECRET');
	const clientSecretHash = authenticatorClientSecretHash(clientSecret, pepper);

	return prisma.authenticatorApplication.upsert({
		where: { applicationId: ACCURA_APPLICATION_ID },
		create: {
			applicationId: ACCURA_APPLICATION_ID,
			name: 'ACCURA ERP',
			status: 'active',
			requireBiometric: false,
			clientSecretHash,
		},
		update: {
			name: 'ACCURA ERP',
			status: 'active',
			clientSecretHash,
		},
	});
}

module.exports = {
	ACCURA_APPLICATION_ID,
	authenticatorClientSecretHash,
	ensureAccuraAuthenticatorApplication,
};
