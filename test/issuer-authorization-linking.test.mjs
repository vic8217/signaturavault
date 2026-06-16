import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createIssuerAuthorizationCode,
  verifyIssuerAuthorizationCode,
} from '../src/lib/issuer-authorization.js';

test('issuer authorization validation returns issuer binding details', async () => {
  const db = { issuer_authorization_codes: [] };

  const generated = await createIssuerAuthorizationCode({
    issuerId: 'issuer_123',
    tenantId: 'tenant_456',
    label: 'Issuer onboarding',
    db,
  });

  const result = await verifyIssuerAuthorizationCode(generated.code, { db });

  assert.ok(result, 'expected the authorization code to validate');
  assert.equal(result.issuerId, 'issuer_123');
  assert.equal(result.tenantId, 'tenant_456');
  assert.equal(result.status, 'active');
});
