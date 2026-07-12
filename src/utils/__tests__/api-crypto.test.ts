import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.API_ENCRYPTION_KEY = '193978a2fd0d3d11d2016772872420583eb491b746507ee1b15415a156037d69';

import {
  decryptPayload,
  encryptPayload,
  isEncryptedEnvelope,
  unwrapEncrypted,
  wrapEncrypted,
} from '../api-crypto';

test('encrypt/decrypt roundtrip', () => {
  const payload = { token: 'abc', user: { name: 'Admin', role: 'Admin' }, nested: [1, 2, 3] };
  const encrypted = encryptPayload(payload);
  const decrypted = decryptPayload(encrypted);
  assert.deepEqual(decrypted, payload);
});

test('wrapEncrypted envelope', () => {
  const wrapped = wrapEncrypted({ ok: true });
  assert.equal(wrapped._enc, true);
  assert.ok(isEncryptedEnvelope(wrapped));
  assert.deepEqual(unwrapEncrypted(wrapped), { ok: true });
});
