import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, rawDb, callsOf } from './stub-sdk.mjs';
import { applySchema } from './stub-db.mjs';
import * as schema from '../tgcloud/schema.js';
import { ensureTopic } from '../tgcloud/lib/topics.js';
import * as store from '../tgcloud/lib/store.js';

beforeEach(() => {
  resetDb();
  applySchema(Object.values(schema), (text) => rawDb().prepare(text).run());
});

const now = () => Math.floor(Date.now() / 1000);

test('a reserved topic blocks a concurrent creator', async () => {
  const link = { id: 1 };
  assert.equal(
    await store.reserveTopic({ link_id: 1, kind: 'anon', conversation_id: 0, created_at: now() }),
    true,
  );

  const first = await ensureTopic(link, 100, 'anon', 0, 'anon topic');
  assert.equal(first.pending, true);
  assert.equal(callsOf('createForumTopic').length, 0);

  const row = rawDb().prepare('SELECT id FROM topics WHERE link_id = 1').get();
  await store.updateTopicState(row.id, 555, 'open');

  const second = await ensureTopic(link, 100, 'anon', 0, 'anon topic');
  assert.equal(second.thread, 555);
  assert.equal(second.created, false);
});

test('a stale reservation is taken over', async () => {
  const link = { id: 1 };
  assert.equal(
    await store.reserveTopic({ link_id: 1, kind: 'anon', conversation_id: 0, created_at: now() - 120 }),
    true,
  );

  const got = await ensureTopic(link, 100, 'anon', 0, 'anon topic');
  assert.ok(got.thread > 0);
  assert.equal(got.created, true);
  assert.equal(callsOf('createForumTopic').length, 1);

  const row = rawDb().prepare('SELECT thread_id, state FROM topics WHERE link_id = 1').get();
  assert.equal(row.state, 'open');
  assert.equal(row.thread_id, got.thread);
});
