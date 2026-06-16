import assert from 'node:assert/strict';
import test from 'node:test';

import { POST } from '@/app/api/signatura/app-link/validate/route.js';
import { prisma } from '@/lib/prisma';

function request(body) {
	return new Request('http://localhost/api/signatura/app-link/validate', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
}

test('ACCURA can validate an active company-role Signatura app link', async () => {
	prisma.__reset?.();
	prisma.signaturaAppLink.__rows.push({
		id: 'link_1',
		userId: 'user_1',
		signaturaId: 'SIG-ACCURA-ROAD-0F7C99-INVT-8K29Q',
		sourceApp: 'ACCURA',
		companyCode: 'ROAD-0F7C99',
		companyName: 'RoadRunner BeepBeep Logistics',
		role: 'inventory_clerk',
		rolePrefix: 'INVT',
		status: 'ACTIVE',
	});

	const response = await POST(
		request({
			source: 'accura',
			signaturaId: 'SIG-ACCURA-ROAD-0F7C99-INVT-8K29Q',
			companyCode: 'ROAD-0F7C99',
			role: 'inventory_clerk',
			rolePrefix: 'INVT',
		}),
	);
	const body = await response.json();

	assert.deepEqual(body, {
		valid: true,
		status: 'ACTIVE',
		sourceApp: 'ACCURA',
		companyCode: 'ROAD-0F7C99',
		role: 'inventory_clerk',
		rolePrefix: 'INVT',
	});
});

test('ACCURA validation rejects mismatched role context', async () => {
	prisma.__reset?.();
	prisma.signaturaAppLink.__rows.push({
		id: 'link_1',
		userId: 'user_1',
		signaturaId: 'SIG-ACCURA-ROAD-0F7C99-INVT-8K29Q',
		sourceApp: 'ACCURA',
		companyCode: 'ROAD-0F7C99',
		role: 'inventory_clerk',
		rolePrefix: 'INVT',
		status: 'ACTIVE',
	});

	const response = await POST(
		request({
			source: 'accura',
			signaturaId: 'SIG-ACCURA-ROAD-0F7C99-INVT-8K29Q',
			companyCode: 'ROAD-0F7C99',
			role: 'cashier',
			rolePrefix: 'CASH',
		}),
	);
	const body = await response.json();

	assert.equal(body.valid, false);
	assert.equal(
		body.message,
		'This Signatura ID is not authorized for the selected company or role.',
	);
});
