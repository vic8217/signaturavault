import { loadDb } from '@/lib/db';

const issuerTypes = [
	'Educational institutions',
	'Government agencies',
	'LGU',
	'Religious organization',
	'Private organization',
	'Others',
];

function normalizeIdentity(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ');
}

function issuerTypeSlug(type) {
	return normalizeIdentity(type || 'Others').replace(/[^a-z0-9]+/g, '-');
}

function issuerTypeFromSlug(slug) {
	return (
		issuerTypes.find((type) => issuerTypeSlug(type) === slug) ||
		'Others'
	);
}

async function getRegisteredIssuers() {
	const db = await loadDb();
	const issuersByIdentity = new Map();

	for (const issuer of db.issuers || []) {
		const identity =
			normalizeIdentity(issuer.registration_number) ||
			normalizeIdentity(issuer.name);
		const currentIssuer = issuersByIdentity.get(identity);

		if (
			!currentIssuer ||
			new Date(issuer.created_at || 0) > new Date(currentIssuer.created_at || 0)
		) {
			issuersByIdentity.set(identity, issuer);
		}
	}

	return Array.from(issuersByIdentity.values()).sort((a, b) =>
		String(a.name || '').localeCompare(String(b.name || '')),
	);
}

async function getRegisteredIssuerById(id) {
	const issuers = await getRegisteredIssuers();
	return issuers.find(
		(issuer) => issuer.id === id || issuer.tenant_id === id,
	);
}

async function getIssuerClassifications() {
	const issuers = await getRegisteredIssuers();

	return issuerTypes.map((type) => {
		const typeIssuers = issuers.filter(
			(issuer) => normalizeIdentity(issuer.type) === normalizeIdentity(type),
		);

		return {
			type,
			slug: issuerTypeSlug(type),
			count: typeIssuers.length,
		};
	});
}

export {
	getIssuerClassifications,
	getRegisteredIssuerById,
	getRegisteredIssuers,
	issuerTypeFromSlug,
	issuerTypeSlug,
	issuerTypes,
};
