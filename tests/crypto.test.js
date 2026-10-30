import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as c from '../tgcloud/lib/crypto.js';

const KEY = '11'.repeat(32);

test('base64url survives a round trip', () => {
  const bytes = c.randomBytes(33);
  assert.deepEqual(Array.from(c.unb64url(c.b64url(bytes))), Array.from(bytes));
});

test('AES-GCM round trip binds the AAD', async () => {
  const { ct, nonce } = await c.encrypt(KEY, 'hello', 'aad');
  assert.equal(await c.decrypt(KEY, ct, nonce, 'aad'), 'hello');
  await assert.rejects(c.decrypt(KEY, ct, nonce, 'other'));
});

test('AES-GCM rejects a tampered ciphertext', async () => {
  const { ct, nonce } = await c.encrypt(KEY, 'hello', 'aad');
  const bad = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
  await assert.rejects(c.decrypt(KEY, bad, nonce, 'aad'));
});

test('HMAC is stable and keyed', async () => {
  const a = await c.hmacHex(KEY, 'x');
  assert.equal(a, await c.hmacHex(KEY, 'x'));
  assert.notEqual(a, await c.hmacHex('22'.repeat(32), 'x'));
});

test('split and join reconstruct the ciphertext', async () => {
  const { ct } = await c.encrypt(KEY, 'payload', 'aad');
  const s = c.split(ct);
  assert.equal(ct.startsWith(s.prefix), true);
  assert.equal(c.join(s.body, s.suffix), ct);
  assert.notEqual(s.body.includes(s.suffix), true);
});

test('fingerprints are short and fixed width', async () => {
  assert.match(await c.sha256Fp('token'), /^[0-9a-f]{16}$/);
});
