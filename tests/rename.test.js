import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, rawDb } from './stub-sdk.mjs';
import { applySchema } from './stub-db.mjs';
import * as schema from '../tgcloud/schema.js';
import { renameWait, markRenamed, formatWait, RENAME_WINDOW_SECONDS } from '../tgcloud/lib/rename.js';

beforeEach(() => {
  resetDb();
  applySchema(Object.values(schema), (text) => rawDb().prepare(text).run());
});

test('topic and memo cooldowns are separate per link', async () => {
  const now = 1_800_000_000;

  assert.equal(await renameWait(1, 'topic', now), 0);
  await markRenamed(1, 'topic', now);

  assert.equal(await renameWait(1, 'topic', now + 60), RENAME_WINDOW_SECONDS - 60);
  assert.equal(await renameWait(1, 'memo', now + 60), 0);
  assert.equal(await renameWait(2, 'topic', now + 60), 0);
  assert.equal(await renameWait(1, 'topic', now + RENAME_WINDOW_SECONDS), 0);
});

test('marking again moves the same row, not a second one', async () => {
  const now = 1_800_000_000;
  await markRenamed(1, 'topic', now);
  await markRenamed(1, 'topic', now + 60);

  const rows = rawDb().prepare("SELECT k, v FROM meta WHERE k LIKE 'rename:%'").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].v, String(now + 60));
});

test('wait time is short and readable', () => {
  assert.equal(formatWait(90), '2m');
  assert.equal(formatWait(RENAME_WINDOW_SECONDS - 60), '23h 59m');
  assert.equal(formatWait(RENAME_WINDOW_SECONDS), '24h');
});
