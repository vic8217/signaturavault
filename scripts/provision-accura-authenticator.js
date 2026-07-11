require('dotenv/config');

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { ensureAccuraAuthenticatorApplication } = require('../prisma/authenticator-application-seed');

const adapter = new PrismaPg(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

async function main() {
	const application = await ensureAccuraAuthenticatorApplication(prisma);
	console.log(`Authenticator application provisioned: ${application.applicationId}`);
}

main()
	.catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
