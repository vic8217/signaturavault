import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis;
const adapter = new PrismaPg(process.env.DATABASE_URL);

const prisma =
	globalForPrisma.signaturaPrisma ||
	new PrismaClient({
		adapter,
		log:
			process.env.NODE_ENV === 'development'
				? ['query', 'error', 'warn']
				: ['error'],
	});

if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.signaturaPrisma = prisma;
}

export { prisma };
