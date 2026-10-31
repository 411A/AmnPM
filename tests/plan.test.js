import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../tgcloud/lib/config.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const specDir = join(root, 'specs', '001-anonymous-link-messaging');
const hasSpecs = existsSync(specDir);
const read = (file) => readFileSync(join(specDir, file), 'utf8');
const localOnly = hasSpecs ? false : 'specs/ is local-only and excluded from the public repo';

test('spec and plan gates are closed', { skip: localOnly }, () => {
  const spec = read('spec.md');
  const plan = read('plan.md');
  assert.doesNotMatch(spec, /\[NEEDS CLARIFICATION\]/);
  assert.match(plan, /Constitution Check/);
  assert.doesNotMatch(plan, /\|\s*FAIL\s*\|/);
  assert.doesNotMatch(`${spec}\n${plan}`, /signed release manifest|manifest signature validation|signs it/i);
  assert.doesNotMatch(`${spec}\n${plan}`, /logs metadata only|one metadata-only line/i);
});

test('every planned task is closed', { skip: localOnly }, () => {
  assert.doesNotMatch(read('tasks.md'), /^- \[ \]/m);
});

test('runtime limits match the plan', () => {
  assert.equal(CONFIG.maxLinksPerOwner, 10);
  assert.equal(CONFIG.throttlePerMinute, 30);
  assert.equal(CONFIG.maxAttempts, 5);
  assert.equal(CONFIG.maxMemoLength, 32);
  assert.equal(CONFIG.tokenLength, 10);
  assert.equal(CONFIG.tokenAlphabet.length, 32);
  assert.equal(new Set(CONFIG.tokenAlphabet).size, 32);
});

test('the plan still states the latency budget', { skip: localOnly }, () => {
  assert.match(read('plan.md'), /under 2 s p95/);
});
