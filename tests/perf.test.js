import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, rawDb, callsOf, db } from './stub-sdk.mjs';
import { applySchema } from './stub-db.mjs';
import * as schema from '../tgcloud/schema.js';
import onMessage from '../tgcloud/handlers/message.js';
import onCallback from '../tgcloud/handlers/callback_query.js';
import { configureBotOnce } from '../tgcloud/lib/bot-config.js';

let seq = 1;

function message(text, chatId, extra = {}) {
  return {
    message_id: extra.message_id ?? seq++,
    date: 0,
    chat: { id: chatId, type: 'private' },
    from: { id: chatId, first_name: 'Bench', language_code: 'en', is_bot: false },
    ...(text === undefined ? {} : { text }),
    ...extra,
  };
}

function lastToken() {
  const sent = callsOf('sendMessage').filter((call) => String(call.args.text).includes('?start='));
  return sent.at(-1)?.args.text.match(/\?start=([0-9a-z]+)/)?.[1];
}

function lastModeData() {
  return callsOf('sendMessage')
    .flatMap((call) => call.args.reply_markup?.inline_keyboard?.flat() ?? [])
    .map((button) => button.callback_data)
    .filter((data) => data?.startsWith('M|'))
    .at(-1);
}

function firstSenderThread() {
  return rawDb().prepare('SELECT thread_id FROM sender_topics ORDER BY id LIMIT 1').get()?.thread_id ?? 0;
}

function countWork() {
  const counts = { sql: 0, api: 0 };
  const origin = { run: db.run, get: db.get, all: db.all };
  for (const method of Object.keys(origin)) {
    db[method] = async (...args) => {
      counts.sql += 1;
      return origin[method](...args);
    };
  }
  return {
    counts,
    restore: () => Object.assign(db, origin),
  };
}

test('hot paths stay within their query and API budgets', async () => {
  resetDb();
  applySchema(Object.values(schema), (text) => rawDb().prepare(text).run());
  await configureBotOnce();

  // Keep the 2% housekeeping sweep out of the counts.
  const random = Math.random;
  Math.random = () => 1;
  try {
    await onMessage(message('/start', 100));
    await onMessage(message('/newlink', 100));
    const token = lastToken();
    assert.ok(token);

    const open = countWork();
    try {
      await onMessage(message(`/start ${token}`, 200));
    } finally {
      open.restore();
    }
    assert.ok(open.counts.sql <= 12, `open-link used ${open.counts.sql} SQL statements`);

    const thread = firstSenderThread();
    const send = countWork();
    try {
      await onMessage(message('hello', 200, { first_name: 'V', message_thread_id: thread }));
    } finally {
      send.restore();
    }
    assert.ok(send.counts.sql <= 15, `sender message used ${send.counts.sql} SQL statements`);

    const data = lastModeData();
    assert.ok(data);
    const mode = countWork();
    try {
      await onCallback({
        id: 'perf-mode',
        from: { id: 200, first_name: 'V', language_code: 'en' },
        message: { message_id: 999, chat: { id: 200 }, reply_to_message: { message_id: 3 } },
        data,
      });
    } finally {
      mode.restore();
    }
    assert.ok(mode.counts.sql <= 34, `mode delivery used ${mode.counts.sql} SQL statements`);
    assert.ok(mode.counts.api <= 4, `mode delivery used ${mode.counts.api} Bot API calls`);
  } finally {
    Math.random = random;
  }
});
