import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('issuer dashboard uses source-aware keys for merged activity feed', async () => {
	const source = await readFile(
		new URL('../src/components/IssuerDashboard.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /item\.kind \|\| 'activity'/);
	assert.doesNotMatch(source, /key=\{item\.id\}/);
});

test('issuer document summary uses collision-resistant keys for merged records', async () => {
	const source = await readFile(
		new URL('../src/components/IssuerDocumentSummary.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /document\.source \|\| 'document'/);
	assert.doesNotMatch(source, /key=\{document\.id\}/);
});

test('wallet quick actions do not key repeated destinations by href', async () => {
	const source = await readFile(
		new URL('../src/app/wallet/page.js', import.meta.url),
		'utf8',
	);

	assert.match(source, /key=\{action\.label\}/);
	assert.doesNotMatch(source, /key=\{action\.href\}/);
});
