import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, rawDb } from './stub-sdk.mjs';
import { applySchema } from './stub-db.mjs';
import * as schema from '../tgcloud/schema.js';
import { renameWait, markRenamed, formatWait, RENAME_WINDOW_SECONDS } from '../tgcloud/lib/rename.js';
import * as store from '../tgcloud/lib/store.js';

beforeEach(() => {
  resetDb();
  applySchema(Object.values(schema), (text) => rawDb().prepare(text).run());
});

test('owner topic, sender topic, and memo limits are independent', async () => {
  const now = 1_800_000_000;

  assert.equal(await renameWait('owner-topic', 10, now), 0);
  await markRenamed('owner-topic', 10, now);

  assert.equal(await renameWait('owner-topic', 10, now + 60), RENAME_WINDOW_SECONDS - 60);
  assert.equal(await renameWait('owner-topic', 11, now + 60), 0);
  assert.equal(await renameWait('sender-topic', 10, now + 60), 0);
  assert.equal(await renameWait('memo', 10, now + 60), 0);
  assert.equal(await renameWait('owner-topic', 10, now + RENAME_WINDOW_SECONDS), 0);
});

test('marking again moves the same row, not a second one', async () => {
  const now = 1_800_000_000;
  await markRenamed('owner-topic', 10, now);
  await markRenamed('owner-topic', 10, now + 60);

  const rows = rawDb().prepare("SELECT k, v FROM meta WHERE k LIKE 'rename:%'").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].v, String(now + 60));
});

test('wait time is short and readable', () => {
  assert.equal(formatWait(90), '2m');
  assert.equal(formatWait(RENAME_WINDOW_SECONDS - 60), '23h 59m');
  assert.equal(formatWait(RENAME_WINDOW_SECONDS), '24h');
});

test('link purge removes only that link rename state', async () => {
  const now = 1_800_000_000;
  rawDb().prepare("INSERT INTO topics (id, link_id, kind, thread_id, name, state) VALUES (10, 1, 'anon', 100, '', 'open')").run();
  rawDb().prepare("INSERT INTO sender_topics (id, link_id, sender_key, thread_id, name, state, created_at) VALUES (20, 1, 'k', 200, '', 'open', 0)").run();

  await markRenamed('owner-topic', 10, now);
  await markRenamed('sender-topic', 20, now);
  await markRenamed('memo', 1, now);
  await markRenamed('memo', 2, now);

  await store.deleteRenameState(1);

  const keys = rawDb().prepare("SELECT k FROM meta WHERE k LIKE 'rename:%' ORDER BY k").all().map((row) => row.k);
  assert.deepEqual(keys, ['rename:memo:2']);
});
