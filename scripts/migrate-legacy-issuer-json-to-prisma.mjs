import 'dotenv/config';

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });
const legacyDbPath = path.join(process.cwd(), 'data', 'db.json');

function asDate(value) {
	const date = value ? new Date(value) : null;
	return date && !Number.isNaN(date.getTime()) ? date : null;
}

function legacyArray(db, key) {
	return Array.isArray(db?.[key]) ? db[key] : [];
}

async function main() {
	const raw = await readFile(legacyDbPath, 'utf8').catch((error) => {
		if (error.code === 'ENOENT') return '{}';
		throw error;
	});
	const db = JSON.parse(raw);
	const tenants = legacyArray(db, 'tenants');
	const issuers = legacyArray(db, 'issuers');
	const issuerApiClients = legacyArray(db, 'issuer_api_clients');
	const issuerApiKeys = legacyArray(db, 'issuer_api_keys');
	const issuerAuthorizationCodes = legacyArray(db, 'issuer_authorization_codes');

	for (const tenant of tenants) {
		await prisma.tenant.upsert({
			where: { id: tenant.id },
			create: {
				id: tenant.id,
				name: tenant.name || tenant.id,
				externalReference: tenant.external_reference || null,
				createdAt: asDate(tenant.created_at) || new Date(),
				updatedAt: asDate(tenant.updated_at) || new Date(),
			},
			update: {
				name: tenant.name || tenant.id,
				externalReference: tenant.external_reference || null,
			},
		});
	}

	for (const issuer of issuers) {
		if (!issuer.id || !issuer.tenant_id) continue;
		await prisma.tenant.upsert({
			where: { id: issuer.tenant_id },
			create: {
				id: issuer.tenant_id,
				name: issuer.name || issuer.tenant_id,
				externalReference: null,
			},
			update: {},
		});
		await prisma.issuer.upsert({
			where: { id: issuer.id },
			create: {
				id: issuer.id,
				tenantId: issuer.tenant_id,
				name: issuer.name || issuer.id,
				contactEmail: issuer.contact_email || null,
				type: issuer.type || null,
				address: issuer.address || null,
				registrationNumber: issuer.registration_number || null,
				registrationDate: asDate(issuer.registration_date),
				status: issuer.status || 'active',
				acceptsRequests: Boolean(issuer.accepts_requests),
				createdAt: asDate(issuer.created_at) || new Date(),
				updatedAt: asDate(issuer.updated_at) || new Date(),
			},
			update: {
				tenantId: issuer.tenant_id,
				name: issuer.name || issuer.id,
				contactEmail: issuer.contact_email || null,
				type: issuer.type || null,
				address: issuer.address || null,
				registrationNumber: issuer.registration_number || null,
				registrationDate: asDate(issuer.registration_date),
				status: issuer.status || 'active',
				acceptsRequests: Boolean(issuer.accepts_requests),
			},
		});
	}

	for (const client of issuerApiClients) {
		if (!client.id || !client.client_id || !client.tenant_id) continue;
		await prisma.issuerApiClient.upsert({
			where: { clientId: client.client_id },
			create: {
				id: client.id,
				tenantId: client.tenant_id,
				name: client.name || `${client.tenant_id} client`,
				clientId: client.client_id,
				clientSecretHash: client.client_secret_hash || null,
				scopes: Array.isArray(client.scopes) ? client.scopes : [],
				createdAt: asDate(client.created_at) || new Date(),
				updatedAt: asDate(client.updated_at) || new Date(),
			},
			update: {
				tenantId: client.tenant_id,
				name: client.name || `${client.tenant_id} client`,
				clientSecretHash: client.client_secret_hash || null,
				scopes: Array.isArray(client.scopes) ? client.scopes : [],
			},
		});
	}

	for (const key of issuerApiKeys) {
		if (!key.id || !key.tenant_id || !key.api_client_id) continue;
		await prisma.issuerApiKey.upsert({
			where: { id: key.id },
			create: {
				id: key.id,
				tenantId: key.tenant_id,
				apiClientId: key.api_client_id,
				keyHash: key.key_hash || null,
				status: key.status || 'active',
				createdAt: asDate(key.created_at) || new Date(),
				updatedAt: asDate(key.updated_at) || new Date(),
			},
			update: {
				tenantId: key.tenant_id,
				apiClientId: key.api_client_id,
				keyHash: key.key_hash || null,
				status: key.status || 'active',
			},
		});
	}

	for (const code of issuerAuthorizationCodes) {
		if (!code.id || !code.codeHash) continue;
		await prisma.issuerAuthorizationCode.upsert({
			where: { codeHash: code.codeHash },
			create: {
				id: code.id,
				issuerId: code.issuerId || null,
				tenantId: code.tenantId || null,
				codeHash: code.codeHash,
				label: code.label || 'Issuer Signatura ID',
				status: code.status || 'active',
				expiresAt: asDate(code.expiresAt) || new Date(),
				usedAt: asDate(code.usedAt),
				createdAt: asDate(code.createdAt) || new Date(),
			},
			update: {
				issuerId: code.issuerId || null,
				tenantId: code.tenantId || null,
				label: code.label || 'Issuer Signatura ID',
				status: code.status || 'active',
				expiresAt: asDate(code.expiresAt) || new Date(),
				usedAt: asDate(code.usedAt),
			},
		});
	}

	console.log('Legacy issuer JSON migration complete.', {
		tenants: tenants.length,
		issuers: issuers.length,
		issuerApiClients: issuerApiClients.length,
		issuerApiKeys: issuerApiKeys.length,
		issuerAuthorizationCodes: issuerAuthorizationCodes.length,
	});
}

main()
	.catch((error) => {
		console.error(error);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
