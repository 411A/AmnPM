import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, rawDb, callsOf, failNext } from './stub-sdk.mjs';
import { applySchema } from './stub-db.mjs';
import * as schema from '../tgcloud/schema.js';
import onMessage from '../tgcloud/handlers/message.js';
import onCallback from '../tgcloud/handlers/callback_query.js';
import { linkMemo } from '../tgcloud/lib/keys.js';
import { configureBotOnce } from '../tgcloud/lib/bot-config.js';

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

function buttons() {
  return ['sendMessage', 'editMessageText']
    .flatMap((method) => callsOf(method))
    .flatMap((call) => call.args.reply_markup?.inline_keyboard?.flat() ?? [])
    .map((button) => button.callback_data)
    .filter(Boolean);
}

function tokenOfFirstLink() {
  const sent = callsOf('sendMessage').filter((call) => String(call.args.text).includes('?start='));
  return sent.at(-1)?.args.text.match(/\?start=([0-9a-z]+)/)?.[1];
}

function firstSenderThread() {
  return rawDb().prepare('SELECT thread_id FROM sender_topics ORDER BY id LIMIT 1').get()?.thread_id ?? 0;
}

function lastSenderThread() {
  return rawDb().prepare('SELECT thread_id FROM sender_topics ORDER BY id DESC LIMIT 1').get()?.thread_id ?? 0;
}

async function setupLink() {
  await onMessage(message('/start', 100));
  const token = tokenOfFirstLink();
  await onMessage(message(`/start ${token}`, 200));
  return token;
}

async function deliverAnonymous() {
  await onMessage(message('hello', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  const data = buttons().find((entry) => entry.startsWith('M|'));
  await onCallback({
    id: 'cb-mode',
    from: { id: 200, first_name: 'V', language_code: 'en' },
    message: { message_id: 999, chat: { id: 200 }, reply_to_message: { message_id: 3 } },
    data,
  });
  return callsOf('sendMessage').filter((call) => call.args.reply_markup).at(-1);
}

async function click(data, userId = 200, replyMarkup, threadId = 0) {
  await onCallback({
    id: `cb-${data}`,
    from: { id: userId, first_name: 'V', language_code: 'en' },
    message: {
      message_id: 999,
      chat: { id: userId },
      ...(threadId ? { message_thread_id: threadId } : {}),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    },
    data,
  });
}

test('bot metadata config runs once', async () => {
  await configureBotOnce();
  assert.equal(callsOf('setMyName').length, 1);
  assert.equal(callsOf('setMyCommands').length, 2);
  assert.equal(callsOf('setMyDescription').length, 2);
  assert.equal(callsOf('setMyShortDescription').length, 2);
  assert.equal(callsOf('setChatMenuButton').length, 1);
  assert.equal(callsOf('setMyProfilePhoto').length, 1);

  await configureBotOnce();
  assert.equal(callsOf('setMyName').length, 1);
  assert.equal(callsOf('setMyProfilePhoto').length, 1);
});

test('help mentions the manual topic rename limitation', async () => {
  await onMessage(message('/help', 100));
  const text = callsOf('sendMessage').at(-1).args.text;
  assert.match(text, /Telegram UI renames/);
  assert.match(text, /only \/rename/);
});

test('owner start creates a link and repeats only the welcome', async () => {
  await onMessage(message('/start', 100));
  const sent = callsOf('sendMessage');
  assert.equal(sent.length, 2);
  assert.match(sent[1].args.text, /t\.me\/test_bot\?start=/);

  const link = rawDb().prepare('SELECT * FROM links').get();
  assert.equal(await linkMemo(link), 'main');
  assert.match(link.memo, /^enc:/);
  assert.equal(link.state, 'active');

  await onMessage(message('/start', 100));
  assert.equal(callsOf('sendMessage').length, 3);
});

test('a stranger reaches the owner anonymously', async () => {
  const token = await setupLink();
  const senderTopic = callsOf('createForumTopic').find((call) => call.args.name.startsWith('\u200E⬆️'));
  assert.equal(senderTopic.args.name, `\u200E⬆️ ${token}`);
  assert.ok(callsOf('sendMessage').at(-1).args.message_thread_id);

  const controls = await deliverAnonymous();

  const copies = callsOf('copyMessages');
  assert.equal(copies.length, 1);
  assert.equal(copies[0].args.chat_id, 100);
  assert.equal(copies[0].args.from_chat_id, 200);
  assert.equal(copies[0].args.message_ids.length, 1);

  const ownerTopic = callsOf('createForumTopic').find((call) => call.args.name.includes('Anonymous'));
  assert.equal(ownerTopic.args.name, '\u200E⬇️ 😶‍🌫️ Anonymous · main');
  assert.ok(controls.args.reply_markup.inline_keyboard.flat().some((b) => b.callback_data.startsWith('A|')));

  const sent = callsOf('editMessageText').find((call) => call.args.text?.startsWith('😶‍🌫️'));
  assert.ok(sent);
  assert.equal(sent.args.chat_id, 200);
  assert.equal(sent.args.message_id, 999);
  assert.equal(sent.args.reply_markup.inline_keyboard.length, 0);
  assert.equal(callsOf('deleteMessage').length, 0);

  const answerData = controls.args.reply_markup.inline_keyboard.flat()
    .find((button) => button.callback_data.startsWith('A|')).callback_data;
  const [, prefix, suffix] = answerData.split('|');
  const row = rawDb().prepare('SELECT body FROM action_tokens WHERE prefix = ?').get(prefix);
  assert.ok(row);
  assert.notEqual(row.body.slice(-suffix.length), suffix);
});

test('an album is copied in one call', async () => {
  await setupLink();
  await onMessage(message(undefined, 200, { media_group_id: 'g1', message_id: 10, caption: 'one', first_name: 'V', message_thread_id: firstSenderThread() }));
  await onMessage(message(undefined, 200, { media_group_id: 'g1', message_id: 11, caption: 'two', first_name: 'V', message_thread_id: firstSenderThread() }));

  const modeKeyboards = callsOf('sendMessage').filter((call) =>
    call.args.reply_markup?.inline_keyboard?.flat()
      .some((button) => String(button.callback_data).startsWith('M|')));
  assert.equal(modeKeyboards.length, 1);
  const data = buttons().find((entry) => entry.startsWith('M|'));
  await onCallback({
    id: 'cb-album',
    from: { id: 200, first_name: 'V', language_code: 'en' },
    message: { message_id: 999, chat: { id: 200 } },
    data,
  });

  const copies = callsOf('copyMessages');
  assert.equal(copies.length, 1);
  assert.deepEqual(copies[0].args.message_ids, [10, 11]);
});

test('history mode keeps one topic and a stable indicator', async () => {
  await setupLink();
  await onMessage(message('one', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  await click(buttons().find((entry) => entry.startsWith('H|')));
  await onMessage(message('two', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  await click(buttons().filter((entry) => entry.startsWith('H|')).at(-1));

  const ownerTopics = callsOf('createForumTopic').filter((call) => call.args.name.startsWith('\u200E⬇️'));
  assert.equal(ownerTopics.length, 1);
  assert.match(ownerTopics[0].args.name, /^\u200E⬇️ 😶‍🌫️💬 [a-z]+-[a-z]+ · main$/);
  const historySent = callsOf('editMessageText')
    .filter((call) => String(call.args.text).includes('Sent with history')).at(-1);
  assert.ok(historySent);
  assert.match(historySent.args.text, /<code>[a-z]+-[a-z]+<\/code>/);
  assert.equal(callsOf('copyMessages').length, 2);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM conversations').get().n, 1);
});

test('forward mode forwards the profile into its own topic', async () => {
  await setupLink();
  await onMessage(message('hi', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  await click(buttons().find((entry) => entry.startsWith('F|')));

  assert.equal(callsOf('forwardMessages').length, 1);
  const ownerTopics = callsOf('createForumTopic').filter((call) => call.args.name.startsWith('\u200E⬇️'));
  assert.match(ownerTopics[0].args.name, /^\u200E⬇️ 😎 V · main$/);
});

test('answer copies the owner reply back to the sender topic', async () => {
  await setupLink();
  const senderTopic = firstSenderThread();
  const controls = await deliverAnonymous();
  const data = controls.args.reply_markup.inline_keyboard.flat()
    .find((button) => button.callback_data.startsWith('A|')).callback_data;

  await onCallback({
    id: 'cb-answer',
    from: { id: 100, language_code: 'en' },
    message: {
      message_id: 999,
      chat: { id: 100 },
      message_thread_id: 104,
      reply_markup: controls.args.reply_markup,
    },
    data,
  });
  const windowMsg = callsOf('sendMessage').find((call) => call.args.text?.includes('Send your reply'));
  assert.equal(windowMsg.args.message_thread_id, 104);
  await onMessage(message('reply text', 100, { message_thread_id: 104 }));

  const copies = callsOf('copyMessage');
  assert.equal(copies.length, 1);
  assert.equal(copies[0].args.chat_id, 200);
  assert.equal(copies[0].args.from_chat_id, 100);
  assert.equal(copies[0].args.message_thread_id, senderTopic);
});

test('a sender with a link topic cannot send from All', async () => {
  await setupLink();
  await onMessage(message('in all', 200, { first_name: 'V' }));

  assert.equal(buttons().filter((entry) => entry.startsWith('M|')).length, 0);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM pending').get().n, 0);
  const sent = callsOf('sendMessage').at(-1);
  assert.match(sent.args.text, /topic/i);
  assert.equal(sent.args.message_thread_id, undefined);
});

test('All is rejected when the sender topic is unavailable', async () => {
  failNext('createForumTopic', { errorCode: 400, description: 'not a forum' });
  await setupLink();
  assert.equal(firstSenderThread(), 0);

  await onMessage(message('in all', 200, { first_name: 'V' }));
  assert.equal(buttons().filter((entry) => entry.startsWith('M|')).length, 0);
  const sent = callsOf('sendMessage').at(-1);
  assert.match(sent.args.text, /Open your link again/);
  assert.ok(sent.args.reply_markup.inline_keyboard.flat().some((button) => String(button.url).includes('?start=')));
});

test('an answer follows the original thread even if the row is stale', async () => {
  await setupLink();
  const senderTopic = firstSenderThread();
  const controls = await deliverAnonymous();
  rawDb().prepare('UPDATE sender_topics SET thread_id = 999999').run();

  const data = controls.args.reply_markup.inline_keyboard.flat()
    .find((button) => button.callback_data.startsWith('A|')).callback_data;
  await click(data, 100, controls.args.reply_markup, 104);
  await onMessage(message('reply text', 100, { message_thread_id: 104 }));

  assert.equal(callsOf('copyMessage').at(-1).args.message_thread_id, senderTopic);
});

test('an answer recreates a missing sender topic instead of leaking to All', async () => {
  await setupLink();
  const senderTopic = firstSenderThread();
  const controls = await deliverAnonymous();
  const data = controls.args.reply_markup.inline_keyboard.flat()
    .find((button) => button.callback_data.startsWith('A|')).callback_data;
  await click(data, 100, controls.args.reply_markup, 104);

  failNext('copyMessage', { errorCode: 400, description: 'Bad Request: message thread not found' });
  failNext('copyMessage', { errorCode: 400, description: 'Bad Request: message thread not found' });
  await onMessage(message('reply text', 100, { message_thread_id: 104 }));

  const topic = callsOf('createForumTopic').at(-1);
  assert.match(topic.args.name, /^\u200E⬆️ /);
  const copies = callsOf('copyMessage');
  assert.equal(copies.length, 1);
  assert.notEqual(copies[0].args.message_thread_id, senderTopic);
  assert.notEqual(
    rawDb().prepare('SELECT thread_id FROM sender_topics ORDER BY id LIMIT 1').get().thread_id,
    senderTopic,
  );
  assert.match(callsOf('sendMessage').at(-1).args.text, /Reply sent/);
});

test('a second answer replaces the target and cleans the old prompt', async () => {
  await setupLink();
  const controls = await deliverAnonymous();
  const data = controls.args.reply_markup.inline_keyboard.flat()
    .find((button) => button.callback_data.startsWith('A|')).callback_data;
  const update = (id) => ({
    id,
    from: { id: 100, language_code: 'en' },
    message: {
      message_id: 999,
      chat: { id: 100 },
      message_thread_id: 104,
      reply_markup: controls.args.reply_markup,
    },
    data,
  });

  await onCallback(update('cb-answer-1'));
  await onCallback(update('cb-answer-2'));

  assert.equal(callsOf('sendMessage').filter((call) => /Send your reply/.test(call.args.text)).length, 2);
  assert.equal(callsOf('answerCallbackQuery').filter((call) => call.args.show_alert).length, 0);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM reply_windows').get().n, 1);
});

test('direct owner text in a per-sender topic replies to the latest message', async () => {
  await setupLink();
  const senderThread = firstSenderThread();
  await onMessage(message('hello', 200, {
    first_name: 'V',
    message_thread_id: senderThread,
    message_id: 55,
  }));
  await click(buttons().find((entry) => entry.startsWith('H|')));

  const ownerThread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'history'").get().thread_id;
  const before = callsOf('copyMessage').length;
  await onMessage(message('direct reply', 100, {
    message_thread_id: ownerThread,
    message_id: 666,
  }));

  const copy = callsOf('copyMessage').at(-1);
  assert.equal(callsOf('copyMessage').length, before + 1);
  assert.equal(copy.args.chat_id, 200);
  assert.equal(copy.args.message_thread_id, senderThread);
  assert.equal(copy.args.reply_to_message_id, 55);
  assert.match(callsOf('sendMessage').at(-1).args.text, /Reply sent/);
});

test('an old per-sender topic is backfilled by one Answer', async () => {
  await setupLink();
  const senderThread = firstSenderThread();
  await onMessage(message('hello', 200, {
    first_name: 'V',
    message_thread_id: senderThread,
    message_id: 55,
  }));
  await click(buttons().find((entry) => entry.startsWith('H|')));

  const ownerThread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'history'").get().thread_id;
  const conversation = rawDb().prepare("SELECT id FROM conversations WHERE mode = 'history'").get();
  rawDb().prepare(`UPDATE conversations SET sender_chat_ct = NULL,
    last_message_id = 0, setup_prompted = 0 WHERE id = ?`).run(conversation.id);

  await onMessage(message('first direct', 100, { message_thread_id: ownerThread }));
  assert.match(callsOf('sendMessage').at(-1).args.text, /created before direct replies/);
  assert.equal(callsOf('copyMessage').length, 0);

  const controls = callsOf('sendMessage').filter((call) => call.args.reply_markup).at(-1);
  const answerData = controls.args.reply_markup.inline_keyboard.flat()
    .find((button) => button.callback_data.startsWith('A|')).callback_data;
  await click(answerData, 100, controls.args.reply_markup, ownerThread);
  assert.ok(
    rawDb().prepare('SELECT sender_chat_ct FROM conversations WHERE id = ?').get(conversation.id).sender_chat_ct,
  );

  await onCallback({
    id: 'cb-cancel-old',
    from: { id: 100, language_code: 'en' },
    message: { message_id: 501, chat: { id: 100 }, message_thread_id: ownerThread },
    data: 'X',
  });

  const before = callsOf('copyMessage').length;
  await onMessage(message('now direct', 100, { message_thread_id: ownerThread }));
  const copy = callsOf('copyMessage').at(-1);
  assert.equal(callsOf('copyMessage').length, before + 1);
  assert.equal(copy.args.reply_to_message_id, 55);
});

test('the reply prompt can be cancelled without sending', async () => {
  await setupLink();
  const controls = await deliverAnonymous();
  const data = controls.args.reply_markup.inline_keyboard.flat()
    .find((button) => button.callback_data.startsWith('A|')).callback_data;
  await click(data, 100, controls.args.reply_markup, 104);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM reply_windows').get().n, 1);

  await onCallback({
    id: 'cb-cancel-reply',
    from: { id: 100, language_code: 'en' },
    message: { message_id: 501, chat: { id: 100 }, message_thread_id: 104 },
    data: 'X',
  });

  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM reply_windows').get().n, 0);
  assert.ok(callsOf('deleteMessage').some((call) => call.args.message_id === 501));
});

test('an owner message in another thread is not sent as the answer', async () => {
  await setupLink();
  const controls = await deliverAnonymous();
  const data = controls.args.reply_markup.inline_keyboard.flat()
    .find((button) => button.callback_data.startsWith('A|')).callback_data;
  await onCallback({
    id: 'cb-answer',
    from: { id: 100, language_code: 'en' },
    message: {
      message_id: 999,
      chat: { id: 100 },
      message_thread_id: 104,
      reply_markup: controls.args.reply_markup,
    },
    data,
  });

  await onMessage(message('not the answer', 100, { message_thread_id: 205 }));

  assert.equal(callsOf('copyMessage').length, 0);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM reply_windows').get().n, 1);
});

test('double mode taps deliver exactly one copy', async () => {
  await setupLink();
  await onMessage(message('hello', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  const data = buttons().find((entry) => entry.startsWith('M|'));
  const update = (id) => ({
    id,
    from: { id: 200, first_name: 'V', language_code: 'en' },
    message: { message_id: 999, chat: { id: 200 }, reply_to_message: { message_id: 3 } },
    data,
  });

  await Promise.all([onCallback(update('cb-mode-1')), onCallback(update('cb-mode-2'))]);

  assert.equal(callsOf('copyMessages').length, 1);
});

test('block refuses the next message', async () => {
  await setupLink();
  const controls = await deliverAnonymous();
  const data = controls.args.reply_markup.inline_keyboard.flat()
    .find((button) => button.callback_data.startsWith('B|')).callback_data;

  await click(data, 100, controls.args.reply_markup);
  await onMessage(message('again', 200, { message_thread_id: firstSenderThread() }));

  assert.match(callsOf('sendMessage').at(-1).args.text, /blocked/);
});

test('a forwarded mode keyboard does not deliver for another user', async () => {
  await setupLink();
  await onMessage(message('hi', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  const data = buttons().find((entry) => entry.startsWith('M|'));
  await click(data, 300);
  assert.equal(callsOf('copyMessages').length, 0);
});

test('forwarded owner controls do not block for another user', async () => {
  await setupLink();
  const controls = await deliverAnonymous();
  const data = controls.args.reply_markup.inline_keyboard.flat()
    .find((button) => button.callback_data.startsWith('B|')).callback_data;
  await click(data, 300, controls.args.reply_markup);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM blocks').get().n, 0);
});

test('a forwarded link menu does not reveal the link to another user', async () => {
  await setupLink();
  await onMessage(message('/links', 100));
  const data = buttons().find((entry) => entry.startsWith('D|'));
  await click(data, 300);
  assert.equal(callsOf('editMessageText').length, 0);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM links').get().n, 1);
});

test('block all refuses the next message on another link', async () => {
  await setupLink();
  const controls = await deliverAnonymous();
  const blockAllData = controls.args.reply_markup.inline_keyboard.flat()
    .filter((button) => String(button.callback_data).startsWith('B|')).at(-1).callback_data;
  await click(blockAllData, 100, controls.args.reply_markup);

  await onMessage(message('/newlink', 100));
  const token = tokenOfFirstLink();
  await onMessage(message(`/start ${token}`, 200));
  await onMessage(message('again', 200, { message_thread_id: lastSenderThread() }));

  assert.match(callsOf('sendMessage').at(-1).args.text, /blocked/);
});

test('a sender topic message is routed to its own link', async () => {
  await setupLink();
  const thread = rawDb().prepare('SELECT thread_id FROM sender_topics ORDER BY id LIMIT 1').get().thread_id;
  await onMessage(message('hello', 200, { first_name: 'V', message_thread_id: thread }));
  const data = buttons().find((entry) => entry.startsWith('M|'));
  await onCallback({
    id: 'cb-topic',
    from: { id: 200, first_name: 'V', language_code: 'en' },
    message: { message_id: 999, chat: { id: 200 }, message_thread_id: thread },
    data,
  });

  const copies = callsOf('copyMessages');
  assert.equal(copies.length, 1);
  assert.equal(copies[0].args.chat_id, 100);
});

test('owner topic text stays in the topic and does not become a sender message', async () => {
  await setupLink();
  await deliverAnonymous();
  const thread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'anon' LIMIT 1").get().thread_id;
  await onMessage(message('plain', 100, { message_thread_id: thread }));

  const sent = callsOf('sendMessage').at(-1);
  assert.match(sent.args.text, /Press Answer/);
  assert.equal(sent.args.message_thread_id, thread);
});

test('double block taps apply once and refresh the button', async () => {
  await setupLink();
  const controls = await deliverAnonymous();
  const blockData = controls.args.reply_markup.inline_keyboard.flat()
    .find((button) => button.callback_data.startsWith('B|')).callback_data;

  await click(blockData, 100, controls.args.reply_markup);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM blocks').get().n, 1);

  const edited = callsOf('editMessageReplyMarkup').at(-1).args.reply_markup.inline_keyboard;
  const nextData = edited[1][0].callback_data;
  assert.notEqual(nextData, blockData);

  await click(blockData, 100, controls.args.reply_markup);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM blocks').get().n, 1);

  await click(nextData, 100, { inline_keyboard: edited });
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM blocks').get().n, 0);
});

test('a failed read receipt shows a popup', async () => {
  await setupLink();
  const controls = await deliverAnonymous();
  const readData = controls.args.reply_markup.inline_keyboard.flat()
    .find((button) => button.callback_data.startsWith('R|')).callback_data;

  failNext('setMessageReaction', { errorCode: 400, description: 'message to react not found' });
  await onCallback({
    id: 'cb-read',
    from: { id: 100, language_code: 'en' },
    message: { message_id: 500, chat: { id: 100 }, reply_markup: controls.args.reply_markup },
    data: readData,
  });

  const alerts = callsOf('answerCallbackQuery').filter((call) => call.args.show_alert);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].args.text, /deleted/);
});

test('changing a memo renames the topics', async () => {
  await setupLink();
  await deliverAnonymous();
  await onMessage(message('/links', 100));
  const menuData = buttons().find((entry) => entry.startsWith('D|'));
  await click(menuData, 100);
  const memoData = buttons().find((entry) => entry.startsWith('E|'));
  await click(memoData, 100);
  await onMessage(message('newmemo', 100));

  const edits = callsOf('editForumTopic');
  assert.equal(edits.length, 1);
  assert.match(edits[0].args.name, /newmemo/);
});

test('owners can rename a topic and keep the mandatory emoji prefix', async () => {
  await setupLink();
  await deliverAnonymous();
  const thread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'anon' LIMIT 1").get().thread_id;
  await onMessage(message('/rename Cool stuff', 100, { message_thread_id: thread }));

  const edit = callsOf('editForumTopic').at(-1);
  assert.equal(edit.args.name, '\u200E⬇️ 😶‍🌫️ Cool stuff · main');
  assert.match(rawDb().prepare('SELECT name FROM topics WHERE thread_id = ?').get(thread).name, /^enc:/);
  assert.equal(callsOf('sendMessage').at(-1).args.message_thread_id, thread);
});

test('a renamed topic keeps its custom name after a memo change', async () => {
  await setupLink();
  await deliverAnonymous();
  const thread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'anon' LIMIT 1").get().thread_id;
  await onMessage(message('/rename Cool stuff', 100, { message_thread_id: thread }));

  await onMessage(message('/links', 100));
  await click(buttons().find((entry) => entry.startsWith('D|')), 100);
  await click(buttons().find((entry) => entry.startsWith('E|')), 100);
  await onMessage(message('newmemo', 100));

  assert.equal(callsOf('editForumTopic').at(-1).args.name, '\u200E⬇️ 😶‍🌫️ Cool stuff · newmemo');
});

test('a renamed forward topic keeps its memo and follows memo changes', async () => {
  await setupLink();
  await onMessage(message('hi', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  await click(buttons().find((entry) => entry.startsWith('F|')));
  const thread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'forward'").get().thread_id;
  assert.ok(thread);

  await onMessage(message('/rename Friends', 100, { message_thread_id: thread }));
  assert.equal(callsOf('editForumTopic').at(-1).args.name, '\u200E⬇️ 😎 Friends · main');

  await onMessage(message('/links', 100));
  await click(buttons().find((entry) => entry.startsWith('D|')), 100);
  await click(buttons().find((entry) => entry.startsWith('E|')), 100);
  await onMessage(message('newmemo', 100));

  assert.equal(callsOf('editForumTopic').at(-1).args.name, '\u200E⬇️ 😎 Friends · newmemo');
});

test('the memo prompt and the memo message are removed after use', async () => {
  await setupLink();
  await deliverAnonymous();
  await onMessage(message('/links', 100));
  await click(buttons().find((entry) => entry.startsWith('D|')), 100);
  await click(buttons().find((entry) => entry.startsWith('E|')), 100);

  const prompt = callsOf('sendMessage').find((call) => /Send the new memo/.test(call.args.text));
  assert.ok(prompt);
  assert.equal(prompt.args.chat_id, 100);

  await onMessage(message('newmemo', 100, { message_id: 7777 }));
  const deleted = callsOf('deleteMessage').map((call) => call.args);
  assert.ok(deleted.some((args) => args.chat_id === 100 && args.message_id === 7777));
  assert.ok(deleted.some((args) => args.chat_id === 100 && args.message_id !== 7777));
  assert.match(callsOf('sendMessage').at(-1).args.text, /Memo updated/);
});

test('senders can rename their own topic with the mandatory up prefix', async () => {
  await setupLink();
  const thread = rawDb().prepare('SELECT thread_id FROM sender_topics ORDER BY id LIMIT 1').get().thread_id;
  await onMessage(message('/rename Mine', 200, { message_thread_id: thread }));

  assert.equal(callsOf('editForumTopic').at(-1).args.name, '\u200E⬆️ Mine');
});

test('no plaintext chat identifiers or message text are stored', async () => {
  const owner = 987654321;
  const visitor = 123456789;
  await onMessage(message('/start', owner));
  const token = tokenOfFirstLink();
  await onMessage(message(`/start ${token}`, visitor));
  await onMessage(message('secret text', visitor, { first_name: 'V', message_thread_id: firstSenderThread() }));

  const tables = rawDb()
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all();
  for (const { name } of tables) {
    const dump = JSON.stringify(rawDb().prepare(`SELECT * FROM ${name}`).all());
    assert.equal(dump.includes(String(owner)), false, `owner id in ${name}`);
    assert.equal(dump.includes(String(visitor)), false, `visitor id in ${name}`);
    assert.equal(dump.includes('secret text'), false, `message text in ${name}`);
  }
});

test('revoke deletes every link-scoped row and retires the token', async () => {
  const token = await setupLink();
  await deliverAnonymous();

  await onMessage(message('/links', 100));
  const menuData = buttons().find((entry) => entry.startsWith('D|'));
  await click(menuData, 100);
  const revokeData = buttons().find((entry) => entry.startsWith('V|'));
  await click(revokeData, 100);
  const confirmData = buttons().find((entry) => entry.startsWith('K|'));
  await click(confirmData, 100);

  const finalEdit = callsOf('editMessageText').at(-1);
  assert.match(finalEdit.args.text, /🗑 <s>https:\/\/t\.me\/test_bot\?start=/);
  assert.equal(finalEdit.args.reply_markup.inline_keyboard.length, 0);

  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM links').get().n, 0);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM retired_tokens').get().n, 1);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM topics').get().n, 0);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM link_slots').get().n, 0);
  assert.equal(callsOf('closeForumTopic').length, 1);

  await onMessage(message(`/start ${token}`, 300));
  assert.match(callsOf('sendMessage').at(-1).args.text, /Stored data deleted/);
});

test('topic commands answer in the same thread', async () => {
  await onMessage(message('/help', 100, { message_thread_id: 42 }));
  const sent = callsOf('sendMessage').at(-1);
  assert.equal(sent.args.message_thread_id, 42);
});

test('a sender is told about deletion when returning to a revoked topic', async () => {
  const token = await setupLink();
  await deliverAnonymous();
  const senderThread = rawDb().prepare('SELECT thread_id FROM sender_topics ORDER BY id LIMIT 1').get().thread_id;

  await onMessage(message('/links', 100));
  await click(buttons().find((entry) => entry.startsWith('D|')), 100);
  await click(buttons().find((entry) => entry.startsWith('V|')), 100);
  await click(buttons().find((entry) => entry.startsWith('K|')), 100);

  await onMessage(message('after', 200, { message_thread_id: senderThread }));
  const sent = callsOf('sendMessage').at(-1);
  assert.match(sent.args.text, /Stored data deleted/);
  assert.equal(sent.args.message_thread_id, senderThread);
});
