import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, rawDb, callsOf, failNext } from './stub-sdk.mjs';
import { applySchema } from './stub-db.mjs';
import * as schema from '../tgcloud/schema.js';
import onMessage from '../tgcloud/handlers/message.js';
import onCallback from '../tgcloud/handlers/callback_query.js';
import { maybeSweep, REMIND_AFTER, PURGE_AFTER } from '../tgcloud/lib/retention.js';
import { t } from '../tgcloud/lib/i18n.js';
import * as store from '../tgcloud/lib/store.js';
import { purgeLink } from '../tgcloud/lib/lifecycle.js';

beforeEach(() => {
  resetDb();
  applySchema(Object.values(schema), (text) => rawDb().prepare(text).run());
});

let seq = 1;

function message(text, chatId, extra = {}) {
  return {
    message_id: extra.message_id ?? seq++,
    date: 0,
    chat: { id: chatId, type: 'private' },
    from: { id: chatId, first_name: extra.first_name ?? 'T', language_code: 'en', is_bot: false },
    ...(text === undefined ? {} : { text }),
    ...extra,
  };
}

function tokenOfFirstLink() {
  const sent = callsOf('sendMessage').filter((call) => String(call.args.text).includes('?start='));
  return sent.at(-1)?.args.text.match(/\?start=([0-9a-z]+)/)?.[1];
}

function firstSenderThread() {
  return rawDb().prepare('SELECT thread_id FROM sender_topics ORDER BY id LIMIT 1').get()?.thread_id ?? 0;
}

function buttons() {
  return ['sendMessage', 'editMessageText']
    .flatMap((method) => callsOf(method))
    .flatMap((call) => call.args.reply_markup?.inline_keyboard?.flat() ?? [])
    .map((button) => button.callback_data)
    .filter(Boolean);
}

async function click(data, userId = 200) {
  await onCallback({
    id: `cb-${data}`,
    from: { id: userId, first_name: 'V', language_code: 'en' },
    message: { message_id: 999, chat: { id: userId } },
    data,
  });
}

async function setupLink() {
  await onMessage(message('/start', 100));
  await onMessage(message('/newlink', 100));
  const token = tokenOfFirstLink();
  await onMessage(message(`/start ${token}`, 200));
  return rawDb().prepare('SELECT * FROM links LIMIT 1').get();
}

function link() {
  return rawDb().prepare('SELECT * FROM links LIMIT 1').get();
}

function resetSweep() {
  rawDb().prepare("DELETE FROM meta WHERE k IN ('retention_at', 'retention_lease')").run();
}

function backdate(seconds) {
  rawDb().prepare('UPDATE links SET last_activity_at = ?').run(seconds);
}

test('a new link starts its activity clock at creation', async () => {
  await setupLink();
  const row = link();
  assert.equal(row.last_activity_at, row.created_at);
  assert.equal(row.reminded_at, 0);
});

test('a delivered message resets the inactivity clock and any reminder', async () => {
  const row = await setupLink();
  rawDb().prepare('UPDATE links SET last_activity_at = 5, reminded_at = 99').run();
  await onMessage(message('hello', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  await click(buttons().find((entry) => entry.startsWith('M|')));

  const after = link();
  assert.ok(after.last_activity_at > 5);
  assert.equal(after.reminded_at, 0);
  assert.ok(after.id === row.id);
});

test('335 days of inactivity sends one reminder and keeps the link', async () => {
  await setupLink();
  const now = Math.floor(Date.now() / 1000) + 10_000;
  backdate(now - REMIND_AFTER - 60);
  resetSweep();

  await maybeSweep(now);
  const reminded = callsOf('sendMessage').find((call) => /11 months/.test(call.args.text ?? ''));
  assert.ok(reminded);
  assert.equal(Number(reminded.args.chat_id), 100);
  assert.ok(link());
  assert.equal(Number(link().reminded_at), now);

  resetSweep();
  await maybeSweep(now + 60);
  assert.equal(
    callsOf('sendMessage').filter((call) => /11 months/.test(call.args.text ?? '')).length,
    1,
  );
});

test('a failed reminder is not retried before expiry, then the link is deleted', async () => {
  await setupLink();
  const now = Math.floor(Date.now() / 1000) + 20_000;
  backdate(now - REMIND_AFTER - 60);
  resetSweep();
  failNext('sendMessage', { errorCode: 403, description: 'Forbidden: bot was blocked by the user' });

  await maybeSweep(now);
  assert.ok(link());
  assert.equal(Number(link().reminded_at), now);

  resetSweep();
  await maybeSweep(now + 60);
  assert.equal(
    callsOf('sendMessage').filter((call) => /11 months/.test(call.args.text ?? '')).length,
    0,
  );

  backdate(now - PURGE_AFTER - 60);
  resetSweep();
  await maybeSweep(now + 120);
  assert.equal(link(), undefined);
});

test('365 days of inactivity deletes the link, its rows, and retires the token', async () => {
  await setupLink();
  const now = Math.floor(Date.now() / 1000) + 30_000;
  backdate(now - PURGE_AFTER - 60);
  resetSweep();

  await maybeSweep(now);
  assert.equal(link(), undefined);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM topics').get().n, 0);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM conversations').get().n, 0);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM retired_tokens').get().n, 1);
  assert.ok(callsOf('sendMessage').some((call) => /12 months/.test(call.args.text ?? '')));
});

test('existing rows without an activity clock get a full grace period', async () => {
  await setupLink();
  rawDb().prepare('UPDATE links SET last_activity_at = 0').run();
  const now = Math.floor(Date.now() / 1000) + 40_000;
  resetSweep();

  await maybeSweep(now);
  assert.ok(link());
  assert.equal(Number(link().last_activity_at), now);
});

test('the sweep runs at most once per 168 hours', async () => {
  await setupLink();
  const now = Math.floor(Date.now() / 1000) + 50_000;
  resetSweep();

  await maybeSweep(now);
  backdate(now - PURGE_AFTER - 60);
  const ran = await maybeSweep(now + 3_600);
  assert.equal(ran, false);
  assert.ok(link());
});

test('the 335 and 365 day boundaries are inclusive', async () => {
  await setupLink();
  const now = Math.floor(Date.now() / 1000) + 90_000;
  backdate(now - REMIND_AFTER);
  resetSweep();
  await maybeSweep(now);
  assert.ok(link());
  assert.equal(
    callsOf('sendMessage').filter((call) => /11 months/.test(call.args.text ?? '')).length,
    1,
  );

  backdate(now - PURGE_AFTER);
  resetSweep();
  await maybeSweep(now);
  assert.equal(link(), undefined);
});

test('334 days is too early and 366 days purges without a reminder', async () => {
  await setupLink();
  const now = Math.floor(Date.now() / 1000) + 95_000;
  backdate(now - REMIND_AFTER + 60);
  resetSweep();

  await maybeSweep(now);
  assert.ok(link());
  assert.equal(
    callsOf('sendMessage').filter((call) => /11 months/.test(call.args.text ?? '')).length,
    0,
  );

  backdate(now - PURGE_AFTER - 60);
  resetSweep();
  await maybeSweep(now);
  assert.equal(link(), undefined);
  assert.equal(
    callsOf('sendMessage').filter((call) => /11 months/.test(call.args.text ?? '')).length,
    0,
  );
});

test('a broken link left by a crashed worker is purged by the sweep', async () => {
  await setupLink();
  rawDb().prepare("UPDATE links SET state = 'broken', state_at = 1").run();
  const now = Math.floor(Date.now() / 1000) + 120_000;
  resetSweep();

  await maybeSweep(now);
  assert.equal(link(), undefined);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM retired_tokens').get().n, 1);
  assert.equal(
    callsOf('sendMessage').filter((call) => /12 months/.test(call.args.text ?? '')).length,
    0,
  );
});

test('a blocked owner does not stop the expiry', async () => {
  await setupLink();
  const now = Math.floor(Date.now() / 1000) + 130_000;
  backdate(now - PURGE_AFTER - 60);
  resetSweep();
  failNext('sendMessage', { errorCode: 403, description: 'Forbidden: bot was blocked by the user' });

  await maybeSweep(now);
  assert.equal(link(), undefined);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM retired_tokens').get().n, 1);
});

test('an unreadable owner chat id still deletes the stored rows', async () => {
  await setupLink();
  const now = Math.floor(Date.now() / 1000) + 140_000;
  backdate(now - PURGE_AFTER - 60);
  rawDb().prepare("UPDATE links SET owner_chat_ct = 'bad', owner_chat_nonce = 'bad'").run();
  resetSweep();

  await maybeSweep(now);
  assert.equal(link(), undefined);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM topics').get().n, 0);
});

test('the reminder claim is atomic against newer activity', async () => {
  await setupLink();
  const row = link();
  const now = Math.floor(Date.now() / 1000) + 150_000;
  assert.equal(await store.claimReminder(row.id, row.last_activity_at - 1, now), false);
  assert.equal(await store.claimReminder(row.id, row.last_activity_at, now), true);
  assert.equal(await store.claimReminder(row.id, row.last_activity_at, now + 1), false);
});

test('a backlog of expired links drains over updates, not weeks', async () => {
  await onMessage(message('/start', 100));
  for (let i = 0; i < 5; i += 1) await onMessage(message('/newlink', 100));
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM links').get().n, 5);

  const now = Math.floor(Date.now() / 1000) + 170_000;
  backdate(now - PURGE_AFTER - 60);
  resetSweep();

  await maybeSweep(now);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM links').get().n, 2);
  assert.equal(await maybeSweep(now + 30), false);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM links').get().n, 2);

  await maybeSweep(now + 301);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM links').get().n, 0);
});

test('expiry closes topics without posting the revoke notice', async () => {
  await setupLink();
  await onMessage(message('hello', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  await click(buttons().find((entry) => entry.startsWith('M|')));

  const now = Math.floor(Date.now() / 1000) + 175_000;
  backdate(now - PURGE_AFTER - 60);
  resetSweep();
  await maybeSweep(now);

  assert.equal(link(), undefined);
  assert.ok(callsOf('closeForumTopic').length > 0);
  assert.equal(
    callsOf('sendMessage').filter((call) => /Topic closed/.test(call.args.text ?? '')).length,
    0,
  );
  assert.ok(callsOf('sendMessage').some((call) => /12 months/.test(call.args.text ?? '')));
});

test('an activity write never moves the clock backwards', async () => {
  await setupLink();
  const row = link();
  rawDb().prepare('UPDATE links SET last_activity_at = ? WHERE id = ?')
    .run(row.last_activity_at + 100, row.id);
  await store.touchLinkActivity(row.id, row.last_activity_at);
  const after = link();
  assert.equal(Number(after.last_activity_at), Number(row.last_activity_at) + 100);
  assert.equal(after.reminded_at, 0);
});

test('the sweep lease admits one worker at a time', async () => {
  const now = Math.floor(Date.now() / 1000) + 160_000;
  resetSweep();
  assert.equal(await store.claimRetentionLease(now, now + 3_600, 168 * 3_600), true);
  assert.equal(await store.claimRetentionLease(now, now + 3_600, 168 * 3_600), false);
});

test('the purge and broken claims are one-shot', async () => {
  await setupLink();
  const row = link();
  assert.equal(await store.claimLinkPurge(row.id, 100), true);
  assert.equal(await store.claimLinkPurge(row.id, 100), false);

  rawDb().prepare("UPDATE links SET state = 'active'").run();
  assert.equal(await store.setLinkBroken(row.id, 100), true);
  assert.equal(await store.setLinkBroken(row.id, 100), false);
});

test('purging one link leaves another link\'s memo prompt alone', async () => {
  await onMessage(message('/start', 100));
  await onMessage(message('/newlink', 100));
  await onMessage(message('/newlink', 100));
  const [first, second] = rawDb().prepare('SELECT * FROM links ORDER BY id').all();
  rawDb().prepare('UPDATE owners SET memo_link_id = ?, memo_message_id = 123').run(second.id);

  assert.equal(await store.claimLinkPurge(first.id, 100), true);
  await purgeLink(first, 100, 'en', 100);

  const owner = rawDb().prepare('SELECT memo_link_id, memo_message_id FROM owners').get();
  assert.equal(owner.memo_link_id, second.id);
  assert.equal(owner.memo_message_id, 123);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM links').get().n, 1);
});

test('the reminder and deletion texts exist in both languages', () => {
  assert.match(t('en', 'retentionReminder', { memo: 'x' }), /11 months/);
  assert.match(t('fa', 'retentionReminder', { memo: 'x' }), /۱۱ ماه/);
  assert.match(t('en', 'linkExpired', { memo: 'x' }), /12 months/);
  assert.match(t('fa', 'linkExpired', { memo: 'x' }), /۱۲ ماه/);
});
