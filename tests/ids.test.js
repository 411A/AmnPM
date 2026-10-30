import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeToken,
  tokenFp,
  sanitizeMemo,
  makeIndicator,
  escapeHtml,
  cleanLabel,
} from '../tgcloud/lib/ids.js';

test('two thousand tokens are unique and well formed', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const token = makeToken();
    assert.match(token, /^[23456789abcdefghjkmnopqrstuvwxyz]{10}$/);
    assert.equal(seen.has(token), false);
    seen.add(token);
  }
});

test('fingerprints are stable', async () => {
  const token = 'amber_fox_k7m2p';
  assert.equal(await tokenFp(token), await tokenFp(token));
});

test('memo is trimmed, collapsed, bounded, and defaulted', () => {
  assert.equal(sanitizeMemo('  work  '), 'work');
  assert.equal(sanitizeMemo('a\n b'), 'a b');
  assert.equal(sanitizeMemo(''), 'main');
  assert.equal(sanitizeMemo('x'.repeat(100)).length, 32);
});

test('indicator is deterministic per link and differs across people', async () => {
  const salt = 'aa'.repeat(32);
  const a = await makeIndicator(salt, 'Visitor');
  assert.equal(a, await makeIndicator(salt, 'Visitor'));
  assert.notEqual(a, await makeIndicator(salt, 'Sara'));
  assert.match(a, /^[a-z]+-[a-z]+$/);
});

test('html in user text is escaped', () => {
  assert.equal(escapeHtml('<b>&'), '&lt;b&gt;&amp;');
});

test('labels strip control characters', () => {
  assert.equal(cleanLabel(' a\nb\tc '), 'a b c');
});
