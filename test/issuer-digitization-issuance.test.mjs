import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('issuer issuance creates credentials only from published templates', async () => {
	const service = await readFile(
		new URL('../src/lib/issuer-credential-issuance.js', import.meta.url),
		'utf8',
	);
	const route = await readFile(
		new URL('../src/app/api/issuer/documents/route.js', import.meta.url),
		'utf8',
	);

	assert.match(service, /status: 'published'/);
	assert.match(service, /Published template is required before issuance/);
	assert.match(service, /encryptCredentialFieldValues/);
	assert.match(service, /fieldValueHashes/);
	assert.match(service, /recipientNameHash/);
	assert.match(service, /new URL\('\/verify', verificationOrigin\)/);
	assert.match(route, /issueDigitalCredentialFromTemplate/);
	assert.match(route, /resolvePublicSignaturaOrigin/);
});

test('issuer issuance UI separates digitization from issuance and renders QR result', async () => {
	const panel = await readFile(
		new URL('../src/components/IssuerTemplateIssuancePanel.js', import.meta.url),
		'utf8',
	);
	const digitalDocuments = await readFile(
		new URL('../src/app/issuer/digital-documents/page.js', import.meta.url),
		'utf8',
	);

	assert.match(panel, /Uploaded samples stay templates/);
	assert.match(panel, /\/api\/issuer\/documents/);
	assert.match(panel, /Issue digital document/);
	assert.match(panel, /import\('qrcode'\)/);
	assert.match(panel, /Bulk issuance scaffold/);
	assert.match(digitalDocuments, /Issued credentials and verification activity/);
	assert.match(digitalDocuments, /metadata\?\.credential\?\.mode === 'template_issuance'/);
	assert.match(digitalDocuments, /Uploaded samples are never treated as issued documents/);
});

test('public verification shows only allowed credential metadata', async () => {
	const records = await readFile(
		new URL('../src/lib/document-records.js', import.meta.url),
		'utf8',
	);
	const verifyPanel = await readFile(
		new URL('../src/components/VerifyDocumentPanel.js', import.meta.url),
		'utf8',
	);

	assert.match(records, /template_name/);
	assert.match(records, /public_fields/);
	assert.match(records, /recipient_name: REDACTED/);
	assert.match(records, /external_id: REDACTED/);
	assert.match(verifyPanel, /Public credential fields/);
	assert.match(verifyPanel, /Private fields/);
});
