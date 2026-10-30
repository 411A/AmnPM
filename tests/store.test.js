import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, rawDb } from './stub-sdk.mjs';
import { applySchema } from './stub-db.mjs';
import * as schema from '../tgcloud/schema.js';
import * as store from '../tgcloud/lib/store.js';
import { userKeyFor } from '../tgcloud/lib/links.js';

before(async () => {
  resetDb();
  applySchema(Object.values(schema), (text) => rawDb().prepare(text).run());
});

test('owner key is stable and the salt is encrypted at rest', async () => {
  const a = await userKeyFor(1);
  assert.equal(a, await userKeyFor(1));
  assert.match(a, /^[0-9a-f]{64}$/);
  const stored = rawDb().prepare("SELECT v FROM meta WHERE k = 'install_salt'").get().v;
  assert.match(stored, /^enc:1:/);
});

test('owner cap is atomic and released', async () => {
  const key = 'owner-1';
  assert.equal(await store.ensureOwner(key, 1), true);
  assert.equal(await store.ensureOwner(key, 1), false);
  assert.equal(await store.claimSlot(key, 2, 1), 0);
  assert.equal(await store.claimSlot(key, 2, 1), 1);
  assert.equal(await store.claimSlot(key, 2, 1), null);
  await store.releaseSlot(key, 0);
  assert.equal(await store.claimSlot(key, 2, 1), 0);
});

test('links are stored, found, listed and deleted', async () => {
  const inserted = await store.insertLink({
    token_lookup: 'lookup-1',
    token_ct: 'ct',
    token_nonce: 'nonce',
    memo: 'work',
    slot: 0,
    owner_key: 'owner-1',
    owner_chat_ct: 'ct',
    owner_chat_nonce: 'nonce',
    dek_wrapped: 'wrapped',
    dek_nonce: 'nonce',
    kek_version: 1,
    created_at: 100,
  });
  const id = inserted.id;
  const link = await store.findLinkByLookup('lookup-1');
  assert.equal(link.id, id);
  assert.equal(link.state, 'active');
  assert.equal((await store.listLinks('owner-1')).length, 1);
  await store.deleteLinkRow(id);
  assert.equal(await store.getLink(id), undefined);
  assert.equal((await store.listLinks('owner-1')).length, 0);
});

test('sessions switch links and reset the mode', async () => {
  await store.upsertSession('user-1', 10, 1);
  await store.setSessionMode('user-1', 'history', 2);
  assert.equal((await store.getSession('user-1')).mode, 'history');
  await store.upsertSession('user-1', 11, 3);
  const session = await store.getSession('user-1');
  assert.equal(session.link_id, 11);
  assert.equal(session.mode, null);
});

test('blocks apply per link and globally', async () => {
  await store.setBlock('owner-1', 5, 'sender-1', 1);
  assert.equal(await store.hasBlock('owner-1', 5, 'sender-1'), true);
  assert.equal(await store.hasBlock('owner-1', 6, 'sender-1'), false);
  assert.equal(await store.isBlocked('owner-1', 5, 'sender-1'), true);
  assert.equal(await store.isBlocked('owner-1', 6, 'sender-1'), false);
  await store.setBlock('owner-1', 0, 'sender-1', 1);
  assert.equal(await store.hasBlock('owner-1', 6, 'sender-1'), false);
  assert.equal(await store.isBlocked('owner-1', 6, 'sender-1'), true);
  await store.clearBlock('owner-1', 5, 'sender-1');
  assert.equal(await store.isBlocked('owner-1', 5, 'sender-1'), true);
});

test('rate limit counts and resets after a minute', async () => {
  for (let i = 0; i < 30; i += 1) assert.equal(await store.bumpRate(1, 's', 100), i + 1);
  assert.equal(await store.bumpRate(1, 's', 100), 31);
  assert.equal(await store.bumpRate(1, 's', 161), 1);
});

test('jobs are claimed once, retried, and failed jobs leave no payload', async () => {
  const first = await store.enqueueJob({
    link_id: 1, kind: 'copy', payload_ct: 'a', payload_nonce: 'n', next_at: 0, created_at: 0,
  });
  const second = await store.enqueueJob({
    link_id: 1, kind: 'copy', payload_ct: 'b', payload_nonce: 'n', next_at: 0, created_at: 0,
  });
  const claimed = await store.claimJob(1);
  assert.equal(claimed.id, first);
  assert.equal((await store.claimJob(1)).id, second);
  await store.retryJob(first, 5);
  const again = await store.claimJob(10);
  assert.equal(again.id, first);
  assert.equal(again.attempts, 1);
  await store.failJob(first);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM jobs WHERE id = ?').get(first).n, 0);
  await store.finishJob(second);
  assert.equal(await store.claimJob(20), undefined);
});

test('revocation leaves no link-scoped rows', async () => {
  const linkId = 77;
  await store.enqueueJob({ link_id: linkId, kind: 'copy', payload_ct: 'a', payload_nonce: 'n', next_at: 0, created_at: 0 });
  await store.putActionToken({ prefix: 'p', body: 'b', nonce: 'n', link_id: linkId, kind: 'mode', expires_at: 999 });
  await store.bumpRate(linkId, 's', 1);
  await store.setBlock('owner-1', linkId, 's', 1);
  await store.createTopic({ link_id: linkId, kind: 'anon', conversation_id: 0, thread_id: 1, name: 'n', state: 'open' });
  await store.createConversation({ link_id: linkId, sender_key: 's', mode: 'history', indicator: 'a-b', topic_id: 1, created_at: 1, last_at: 1 });
  await store.upsertSession('u', linkId, 1);
  await store.openReplyWindow({ owner_key: 'owner-1', link_id: linkId, target_ct: 'c', target_nonce: 'n', original_id: 1, expires_at: 999 });
  await store.insertLink({
    token_lookup: 'lookup-2', token_ct: 'ct', token_nonce: 'nonce',
    memo: 'm', slot: 0, owner_key: 'owner-1', owner_chat_ct: 'c',
    owner_chat_nonce: 'n', dek_wrapped: 'w', dek_nonce: 'n', kek_version: 1, created_at: 1,
  });
  const beforeCounts = await store.countLinkRows(linkId);
  assert.equal(beforeCounts.jobs, 1);
  await store.deleteLinkScoped(linkId);
  await store.deleteLinkRow(linkId);
  const afterCounts = await store.countLinkRows(linkId);
  for (const [table, count] of Object.entries(afterCounts)) assert.equal(count, 0, table);
});
