import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { resetDb, rawDb, callsOf, failNext } from './stub-sdk.mjs';
import { applySchema } from './stub-db.mjs';
import * as schema from '../tgcloud/schema.js';
import onMessage from '../tgcloud/handlers/message.js';
import onCallback from '../tgcloud/handlers/callback_query.js';
import { CONFIG } from '../tgcloud/lib/config.js';
import { linkMemo } from '../tgcloud/lib/keys.js';
import { tokenFp, makeIndicator, aliasFp } from '../tgcloud/lib/ids.js';
import { conversationLabel } from '../tgcloud/lib/keys.js';
import { configureBotOnce } from '../tgcloud/lib/bot-config.js';
import * as store from '../tgcloud/lib/store.js';
import { deliver } from '../tgcloud/lib/delivery.js';
import { drain } from '../tgcloud/lib/queue.js';
import { senderKeyFor, userKeyFor } from '../tgcloud/lib/links.js';

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

function lastMenuButtons() {
  return callsOf('editMessageText').at(-1)?.args.reply_markup?.inline_keyboard?.flat() ?? [];
}

function modeToggle(mode) {
  return lastMenuButtons().find((entry) => entry.callback_data.startsWith(`T|${mode}|`)).callback_data;
}

async function openLinkList() {
  await onMessage(message('/settings', 100));
  await click('m:links', 100);
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
  await onMessage(message('/newlink', 100));
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
  assert.equal(callsOf('setMyProfilePhoto').length, 0);

  const commands = callsOf('setMyCommands')[0].args.commands;
  assert.deepEqual(
    commands.map((entry) => entry.command),
    ['start', 'newlink', 'settings', 'rename', 'help', 'privacy', 'about'],
  );
  assert.ok(commands.every((entry) => !entry.description.includes('\n')));
  assert.match(commands[0].description, /^🔰 /);
  assert.match(commands[2].description, /^🎛 .*&/);
  assert.match(commands[6].description, /^ℹ️ /);

  await configureBotOnce();
  assert.equal(callsOf('setMyName').length, 1);
  assert.equal(callsOf('setMyProfilePhoto').length, 0);
});

test('help mentions the manual topic rename limitation', async () => {
  await onMessage(message('/help', 100));
  const sent = callsOf('sendRichMessage').at(-1);
  assert.match(sent.args.rich_message.html, /Telegram UI renames/);
  assert.match(sent.args.rich_message.html, /only \/rename/);
  assert.equal(sent.args.reply_markup, undefined);
});

test('about renders bot and source as a rich table', async () => {
  await onMessage(message('/about', 100));
  const sent = callsOf('sendRichMessage').at(-1);
  assert.match(sent.args.rich_message.html, /<table/);
  assert.match(sent.args.rich_message.html, /@AmnPMBot/);
  assert.match(sent.args.rich_message.html, /GitHub/);
  assert.equal(sent.args.reply_markup, undefined);
});

test('owner start shows one main-link button only after a link exists', async () => {
  await onMessage(message('/start', 100));
  let sent = callsOf('sendMessage').at(-1);
  assert.equal(sent.args.reply_markup, undefined);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM links').get().n, 0);
  assert.match(sent.args.text, /Use \/newlink/);
  assert.match(sent.args.text, /running code matches source|unverified release/);

  await onMessage(message('/newlink', 100));
  await onMessage(message('/start', 100));
  sent = callsOf('sendMessage').at(-1);
  const rows = sent.args.reply_markup.inline_keyboard;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].length, 1);
  assert.match(rows[0][0].url, /t\.me\/test_bot\?start=/);
  assert.equal(rows[0][0].callback_data, undefined);
});

test('new links use numbered default memos and keep explicit ones', async () => {
  await onMessage(message('/start', 100));
  await onMessage(message('/newlink', 100));
  await onMessage(message('/newlink', 100));
  await onMessage(message('/newlink custom', 100));

  const links = rawDb().prepare('SELECT * FROM links ORDER BY id').all();
  assert.deepEqual(await Promise.all(links.map(linkMemo)), ['link 1', 'link 2', 'custom']);
});

test('privacy command explains what is stored', async () => {
  await onMessage(message('/privacy', 100));
  const text = callsOf('sendMessage').at(-1).args.text;
  assert.match(text, /No message content is stored/);
  assert.match(text, /Telegram Serverless/);
  assert.match(text, /core\.telegram\.org\/bots\/serverless/);
  assert.match(text, /<blockquote expandable>/);
});

test('/settings opens the home menu without a back button', async () => {
  await onMessage(message('/start', 100));
  await onMessage(message('/settings', 100));
  const sent = callsOf('sendMessage').at(-1);
  assert.match(sent.args.text, /Settings/);
  const keyboard = sent.args.reply_markup.inline_keyboard;
  assert.deepEqual(
    keyboard.flat().map((button) => button.callback_data),
    ['m:links', 'm:modes', 'm:help', 'm:about'],
  );
});

test('help opened from settings edits the message with a back button last', async () => {
  await onMessage(message('/start', 100));
  await onMessage(message('/settings', 100));
  const before = callsOf('sendMessage').length;
  await click('m:help', 100);
  const edit = callsOf('editMessageText').at(-1);
  assert.match(edit.args.rich_message.html, /Commands/);
  assert.equal(edit.args.reply_markup.inline_keyboard.at(-1)[0].callback_data, 'm:home');
  assert.equal(callsOf('sendMessage').length, before);
});

test('about opened from settings edits the message with a back button last', async () => {
  await onMessage(message('/start', 100));
  await onMessage(message('/settings', 100));
  const before = callsOf('sendMessage').length;
  await click('m:about', 100);
  const edit = callsOf('editMessageText').at(-1);
  assert.match(edit.args.rich_message.html, /<table/);
  assert.match(edit.args.rich_message.html, /No message content is stored/);
  assert.equal(edit.args.reply_markup.inline_keyboard.at(-1)[0].callback_data, 'm:home');
  assert.equal(callsOf('sendMessage').length, before);
});

test('my links shows two link buttons per row', async () => {
  await onMessage(message('/start', 100));
  await onMessage(message('/newlink', 100));
  await onMessage(message('/newlink', 100));
  await openLinkList();
  const keyboard = callsOf('editMessageText').at(-1).args.reply_markup.inline_keyboard;
  assert.equal(keyboard[0].length, 2);
  assert.ok(keyboard[0].every((button) => button.callback_data.startsWith('D|')));
  assert.equal(keyboard.at(-1)[0].callback_data, 'm:home');
});

test('the owner can hide send modes and senders see only the rest', async () => {
  await setupLink();
  await onMessage(message('/settings', 100));
  await click('m:modes', 100);
  await click(modeToggle('history'), 100);
  await click(modeToggle('forward'), 100);

  await onMessage(message('hello', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));

  const chooser = callsOf('sendMessage').filter((call) =>
    call.args.reply_markup?.inline_keyboard?.flat()
      .some((button) => String(button.callback_data).startsWith('M|'))).at(-1);
  assert.equal(chooser.args.reply_markup.inline_keyboard.length, 1);
  assert.match(chooser.args.text, /Full anonymous/);
  assert.doesNotMatch(chooser.args.text, /With history|Forward/);
});

test('mode toggles carry state in color as well as glyphs', async () => {
  await onMessage(message('/start', 100));
  await onMessage(message('/settings', 100));
  await click('m:modes', 100);

  for (const button of lastMenuButtons().filter((entry) => entry.callback_data.startsWith('T|'))) {
    assert.match(button.callback_data, /^T\|(anon|history|forward)\|(0|1)$/);
    assert.ok(button.style === 'success' || button.style === 'danger');
  }
  const styles = Object.fromEntries(lastMenuButtons()
    .filter((entry) => entry.callback_data.startsWith('T|'))
    .map((entry) => [entry.callback_data.split('|')[1], entry.style]));
  assert.deepEqual(styles, { anon: 'success', history: 'success', forward: 'success' });

  await click(modeToggle('history'), 100);
  const toggled = lastMenuButtons().find((entry) => entry.callback_data.startsWith('T|history|'));
  assert.equal(toggled.style, 'danger');
  assert.match(toggled.text, /^✗ /);
  assert.match(toggled.callback_data, /\|1$/);
});

test('a menu pressed from another chat cannot change owner modes', async () => {
  await onMessage(message('/start', 100));
  await onMessage(message('/settings', 100));
  await click('m:modes', 100);
  const data = modeToggle('history');
  const before = rawDb().prepare('SELECT modes FROM owners').get().modes;

  await onCallback({
    id: 'cb-other-chat',
    from: { id: 300, first_name: 'X', language_code: 'en' },
    message: { message_id: 999, chat: { id: 100 } },
    data,
  });

  assert.equal(rawDb().prepare('SELECT modes FROM owners').get().modes, before);
});

test('a stale chooser cannot use a mode the owner disabled', async () => {
  await setupLink();
  await onMessage(message('hello', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));

  const forward = callsOf('sendMessage').filter((call) =>
    call.args.reply_markup?.inline_keyboard?.flat()
      .some((button) => String(button.callback_data).startsWith('F|'))).at(-1)
    .args.reply_markup.inline_keyboard.flat()
    .find((button) => String(button.callback_data).startsWith('F|'));

  await onMessage(message('/settings', 100));
  await click('m:modes', 100);
  await click(modeToggle('forward'), 100);
  await click(forward.callback_data, 200);

  assert.equal(callsOf('copyMessages').length, 0);
  assert.match(callsOf('answerCallbackQuery').filter((call) => call.args.text).at(-1).args.text, /no longer available/);
});

test('the last enabled mode cannot be disabled', async () => {
  await onMessage(message('/start', 100));
  await onMessage(message('/settings', 100));
  await click('m:modes', 100);
  await click(modeToggle('anon'), 100);
  await click(modeToggle('history'), 100);
  await click(modeToggle('forward'), 100);

  const alerts = callsOf('answerCallbackQuery').filter((call) => call.args.show_alert);
  assert.match(alerts.at(-1).args.text, /at least one mode/);
  assert.equal(lastMenuButtons().find((button) => button.callback_data.startsWith('T|forward|')).style, 'success');
});

test('a stranger reaches the owner anonymously', async () => {
  const token = await setupLink();
  const senderTopic = callsOf('createForumTopic').find((call) => call.args.name.startsWith('\u200E⬆️'));
  assert.equal(senderTopic.args.name, `\u200E⬆️ ${token}`);
  assert.ok(callsOf('sendMessage').at(-1).args.message_thread_id);

  const controls = await deliverAnonymous();
  assert.match(controls.args.text, /^👽 Anonymous · link 1/);

  const copies = callsOf('copyMessages');
  assert.equal(copies.length, 1);
  assert.equal(copies[0].args.chat_id, 100);
  assert.equal(copies[0].args.from_chat_id, 200);
  assert.equal(copies[0].args.message_ids.length, 1);

  const ownerTopic = callsOf('createForumTopic').find((call) => call.args.name.includes('Anonymous'));
  assert.equal(ownerTopic.args.name, '\u200E⬇️ 👽 Anonymous · link 1');
  assert.ok(controls.args.reply_markup.inline_keyboard.flat().some((b) => b.callback_data.startsWith('A|')));

  const sent = callsOf('editMessageText').find((call) => call.args.text?.startsWith('👽'));
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
  assert.match(ownerTopics[0].args.name, /^\u200E⬇️ 😶‍🌫️ [a-z]+-[a-z]+-[a-z]+ · link 1$/);
  const historySent = callsOf('editMessageText')
    .filter((call) => String(call.args.text).includes('Sent with history')).at(-1);
  assert.ok(historySent);
  assert.match(historySent.args.text, /<code>[a-z]+-[a-z]+-[a-z]+<\/code>/);
  assert.equal(callsOf('copyMessages').length, 2);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM conversations').get().n, 1);
});

test('forward mode forwards the profile into its own topic', async () => {
  await setupLink();
  await onMessage(message('hi', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  await click(buttons().find((entry) => entry.startsWith('F|')));

  assert.equal(callsOf('forwardMessages').length, 1);
  const ownerTopics = callsOf('createForumTopic').filter((call) => call.args.name.startsWith('\u200E⬇️'));
  assert.match(ownerTopics[0].args.name, /^\u200E⬇️ 😎 V · link 1$/);
});

test('profile labels are escaped in the owner HTML header', async () => {
  await setupLink();
  await onMessage(message('hi', 200, { first_name: '<b>V</b>', message_thread_id: firstSenderThread() }));
  await click(buttons().find((entry) => entry.startsWith('F|')));

  const controls = callsOf('sendMessage')
    .filter((call) => call.args.parse_mode === 'HTML'
      && call.args.reply_markup?.inline_keyboard?.flat()
        .some((button) => String(button.callback_data).startsWith('B|')))
    .at(-1);
  assert.match(controls.args.text, /&lt;b&gt;V&lt;\/b&gt;/);
  assert.doesNotMatch(controls.args.text, /<b>V<\/b>/);
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

test('a job queued before a block is dropped at drain time', async () => {
  await setupLink();
  const link = rawDb().prepare('SELECT * FROM links LIMIT 1').get();
  const senderKey = await senderKeyFor(link, 200);
  await deliver(link, 200, senderKey, 'anon', [77], 'V', 100, 0);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM jobs').get().n, 1);

  await store.setBlock(link.owner_key, 0, await userKeyFor(200), 100);
  await drain();

  assert.equal(callsOf('copyMessages').length, 0);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM jobs').get().n, 0);
});

test('a 429 defers a job without spending its retry budget', async () => {
  await setupLink();
  const link = rawDb().prepare('SELECT * FROM links LIMIT 1').get();
  const senderKey = await senderKeyFor(link, 200);
  await deliver(link, 200, senderKey, 'anon', [77], 'V', 100, 0);

  failNext('copyMessages', { errorCode: 429, parameters: { retry_after: 7 } });
  await drain();

  const job = rawDb().prepare('SELECT state, attempts, next_at FROM jobs LIMIT 1').get();
  assert.equal(job.state, 'pending');
  assert.equal(job.attempts, 0);
  assert.ok(job.next_at > 0);
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
  await openLinkList();
  const data = buttons().find((entry) => entry.startsWith('D|'));
  const before = callsOf('editMessageText').length;
  await click(data, 300);
  assert.equal(callsOf('editMessageText').length, before);
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
  await openLinkList();
  const menuData = buttons().find((entry) => entry.startsWith('D|'));
  await click(menuData, 100);
  const memoData = buttons().find((entry) => entry.startsWith('E|'));
  await click(memoData, 100);
  await onMessage(message('newmemo', 100));

  const edits = callsOf('editForumTopic');
  assert.equal(edits.length, 1);
  assert.match(edits[0].args.name, /newmemo/);
});

test('a renamed label cannot repeat another topic label', async () => {
  await setupLink();
  await deliverAnonymous();
  const anonThread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'anon' LIMIT 1").get().thread_id;
  await onMessage(message('/rename Friends', 100, { message_thread_id: anonThread }));

  await onMessage(message('hello', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  await click(buttons().filter((entry) => entry.startsWith('H|')).at(-1));
  const historyThread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'history'").get().thread_id;

  const before = callsOf('editForumTopic').length;
  await onMessage(message('/rename friends', 100, { message_thread_id: historyThread }));
  assert.match(callsOf('sendMessage').at(-1).args.text, /already used/);
  assert.equal(callsOf('editForumTopic').length, before);

  await onMessage(message('/rename Family', 100, { message_thread_id: historyThread }));
  assert.match(callsOf('sendMessage').at(-1).args.text, /renamed/i);
  assert.equal(callsOf('editForumTopic').length, before + 1);
});

test('a rename retries once after a transient edit failure', async () => {
  await setupLink();
  await deliverAnonymous();
  const thread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'anon' LIMIT 1").get().thread_id;

  failNext('editForumTopic', { errorCode: 429, parameters: { retry_after: 1 } });
  const before = callsOf('editForumTopic').length;
  await onMessage(message('/rename Friends', 100, { message_thread_id: thread }));

  // The first edit threw (unrecorded by the stub); the retry recorded the success.
  assert.equal(callsOf('editForumTopic').length, before + 1);
  assert.match(callsOf('sendMessage').at(-1).args.text, /renamed/i);
  assert.ok(!callsOf('sendMessage').some((call) => /Could not rename/.test(call.args.text ?? '')));
});

test('re-setting the same label skips the API call', async () => {
  await setupLink();
  await deliverAnonymous();
  const thread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'anon' LIMIT 1").get().thread_id;
  await onMessage(message('/rename Friends', 100, { message_thread_id: thread }));

  const before = callsOf('editForumTopic').length;
  await onMessage(message('/rename Friends', 100, { message_thread_id: thread }));
  assert.equal(callsOf('editForumTopic').length, before);
  assert.match(callsOf('sendMessage').at(-1).args.text, /renamed/i);
});

test('owners can rename a topic and keep the mandatory emoji prefix', async () => {
  await setupLink();
  await deliverAnonymous();
  const thread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'anon' LIMIT 1").get().thread_id;
  await onMessage(message('/rename Cool stuff', 100, { message_thread_id: thread }));

  const edit = callsOf('editForumTopic').at(-1);
  assert.equal(edit.args.name, '\u200E⬇️ 👽 Cool stuff · link 1');
  assert.match(rawDb().prepare('SELECT name FROM topics WHERE thread_id = ?').get(thread).name, /^enc:/);
  assert.equal(callsOf('sendMessage').at(-1).args.message_thread_id, thread);
});

test('a renamed topic keeps its custom name after a memo change', async () => {
  await setupLink();
  await deliverAnonymous();
  const thread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'anon' LIMIT 1").get().thread_id;
  await onMessage(message('/rename Cool stuff', 100, { message_thread_id: thread }));

  await openLinkList();
  await click(buttons().find((entry) => entry.startsWith('D|')), 100);
  await click(buttons().find((entry) => entry.startsWith('E|')), 100);
  await onMessage(message('newmemo', 100));

  assert.equal(callsOf('editForumTopic').at(-1).args.name, '\u200E⬇️ 👽 Cool stuff · newmemo');
});

test('a renamed forward topic keeps its memo and follows memo changes', async () => {
  await setupLink();
  await onMessage(message('hi', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  await click(buttons().find((entry) => entry.startsWith('F|')));
  const thread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'forward'").get().thread_id;
  assert.ok(thread);

  await onMessage(message('/rename Friends', 100, { message_thread_id: thread }));
  assert.equal(callsOf('editForumTopic').at(-1).args.name, '\u200E⬇️ 😎 Friends · link 1');

  await openLinkList();
  await click(buttons().find((entry) => entry.startsWith('D|')), 100);
  await click(buttons().find((entry) => entry.startsWith('E|')), 100);
  await onMessage(message('newmemo', 100));

  assert.equal(callsOf('editForumTopic').at(-1).args.name, '\u200E⬇️ 😎 Friends · newmemo');
});

test('the memo prompt and the memo message are removed after use', async () => {
  await setupLink();
  await deliverAnonymous();
  await openLinkList();
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

test('senders can rename their own topic with the mandatory sender prefix', async () => {
  await setupLink();
  const thread = rawDb().prepare('SELECT thread_id FROM sender_topics ORDER BY id LIMIT 1').get().thread_id;
  await onMessage(message('/rename Mine', 200, { message_thread_id: thread }));

  assert.equal(callsOf('editForumTopic').at(-1).args.name, '\u200E⬆️ Mine');
});

test('no plaintext chat identifiers or message text are stored', async () => {
  const owner = 987654321;
  const visitor = 123456789;
  await onMessage(message('/start', owner));
  await onMessage(message('/newlink', owner));
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

  await openLinkList();
  const menuData = buttons().find((entry) => entry.startsWith('D|'));
  await click(menuData, 100);
  const revokeData = buttons().find((entry) => entry.startsWith('V|'));
  await click(revokeData, 100);
  const confirmMenu = callsOf('editMessageText').at(-1);
  assert.equal(confirmMenu.args.reply_markup.inline_keyboard.at(-1)[0].callback_data, 'm:links');
  const confirmData = buttons().find((entry) => entry.startsWith('K|'));
  await click(confirmData, 100);

  const finalEdit = callsOf('editMessageText').at(-1);
  assert.match(finalEdit.args.text, /❌ <s>https:\/\/t\.me\/test_bot\?start=/);
  assert.equal(finalEdit.args.reply_markup.inline_keyboard.length, 0);

  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM links').get().n, 0);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM retired_tokens').get().n, 1);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM topics').get().n, 0);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM link_slots').get().n, 0);
  assert.equal(callsOf('closeForumTopic').length, 1);

  await onMessage(message(`/start ${token}`, 300));
  assert.match(callsOf('sendMessage').at(-1).args.text, /Link unavailable/);
  assert.match(callsOf('sendMessage').at(-1).args.text, /can no longer send messages/);
});

test('a topic is marked closed when Telegram cannot close it', async () => {
  await setupLink();
  await deliverAnonymous();
  failNext('closeForumTopic', new Error('not available in private chats'));

  await openLinkList();
  await click(buttons().find((entry) => entry.startsWith('D|')), 100);
  await click(buttons().find((entry) => entry.startsWith('V|')), 100);
  await click(buttons().find((entry) => entry.startsWith('K|')), 100);

  const edit = callsOf('editForumTopic').at(-1);
  assert.match(edit.args.name, / · ❌$/);
});

test('topic commands answer in the same thread', async () => {
  await onMessage(message('/help', 100, { message_thread_id: 42 }));
  const sent = callsOf('sendRichMessage').at(-1);
  assert.equal(sent.args.message_thread_id, 42);
});

test('a sender is told about deletion when returning to a revoked topic', async () => {
  await setupLink();
  await deliverAnonymous();
  const senderThread = rawDb().prepare('SELECT thread_id FROM sender_topics ORDER BY id LIMIT 1').get().thread_id;

  await openLinkList();
  await click(buttons().find((entry) => entry.startsWith('D|')), 100);
  await click(buttons().find((entry) => entry.startsWith('V|')), 100);
  await click(buttons().find((entry) => entry.startsWith('K|')), 100);

  await onMessage(message('after', 200, { message_thread_id: senderThread }));
  const sent = callsOf('sendMessage').at(-1);
  assert.match(sent.args.text, /This topic is closed/);
  assert.match(sent.args.text, /answer anyone in this topic/);
  assert.equal(sent.args.message_thread_id, senderThread);
});

test('a revoked token is recognized regardless of case', async () => {
  const token = await setupLink();
  const link = rawDb().prepare('SELECT * FROM links LIMIT 1').get();
  await store.insertRetired(await tokenFp(token), 1);
  await store.deleteLinkRow(link.id);

  const variant = token.replace(/[a-z]/, (char) => char.toUpperCase());
  assert.notEqual(variant, token);

  await onMessage(message(`/start ${variant}`, 300));
  assert.match(callsOf('sendMessage').at(-1).args.text, /Link unavailable/);
});

test('a blocked sender does not receive direct owner replies', async () => {
  await setupLink();
  const senderThread = firstSenderThread();
  await onMessage(message('hello', 200, {
    first_name: 'V',
    message_thread_id: senderThread,
    message_id: 55,
  }));
  await click(buttons().find((entry) => entry.startsWith('H|')));

  const ownerThread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'history'").get().thread_id;
  const controls = callsOf('sendMessage').filter((call) => call.args.reply_markup).at(-1);
  const blockData = controls.args.reply_markup.inline_keyboard.flat()
    .find((button) => button.callback_data.startsWith('B|')).callback_data;
  await click(blockData, 100, controls.args.reply_markup);

  const before = callsOf('copyMessage').length;
  await onMessage(message('direct reply', 100, {
    message_thread_id: ownerThread,
    message_id: 666,
  }));

  assert.equal(callsOf('copyMessage').length, before);
  assert.match(callsOf('sendMessage').at(-1).args.text, /blocked this sender/i);

  const readData = controls.args.reply_markup.inline_keyboard.flat()
    .find((button) => button.callback_data.startsWith('R|')).callback_data;
  const reactions = callsOf('setMessageReaction').length;
  await click(readData, 100, controls.args.reply_markup);
  assert.equal(callsOf('setMessageReaction').length, reactions);
  assert.match(callsOf('answerCallbackQuery').at(-1).args.text, /blocked this sender/i);
});

test('a reply window opened before a block cannot deliver', async () => {
  await setupLink();
  const controls = await deliverAnonymous();
  const answerData = controls.args.reply_markup.inline_keyboard.flat()
    .find((button) => button.callback_data.startsWith('A|')).callback_data;
  const blockData = controls.args.reply_markup.inline_keyboard.flat()
    .find((button) => button.callback_data.startsWith('B|')).callback_data;

  await click(answerData, 100, controls.args.reply_markup, 104);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM reply_windows').get().n, 1);

  await click(blockData, 100, controls.args.reply_markup);
  const before = callsOf('copyMessage').length;
  await onMessage(message('late reply', 100, { message_thread_id: 104, message_id: 777 }));

  assert.equal(callsOf('copyMessage').length, before);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM reply_windows').get().n, 0);
  assert.match(callsOf('sendMessage').at(-1).args.text, /blocked this sender/i);
});

test('a stockpiled mode choice pays the delivery rate limit', async () => {
  await setupLink();
  const link = rawDb().prepare('SELECT * FROM links LIMIT 1').get();
  const senderKey = await senderKeyFor(link, 200);
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < 30; i += 1) await store.bumpRate(link.id, `out:${senderKey}`, now);

  await onMessage(message('hello', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  const data = buttons().find((entry) => entry.startsWith('M|'));
  const before = callsOf('copyMessages').length;
  await click(data);

  assert.equal(callsOf('copyMessages').length, before);
  assert.match(callsOf('answerCallbackQuery').at(-1).args.text, /Too fast/);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM pending').get().n, 1);
});

test('an album pays its message count against the delivery rate limit', async () => {
  await setupLink();
  const link = rawDb().prepare('SELECT * FROM links LIMIT 1').get();
  const senderKey = await senderKeyFor(link, 200);
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < 29; i += 1) await store.bumpRate(link.id, `out:${senderKey}`, now);

  await onMessage(message(undefined, 200, {
    media_group_id: 'g1',
    message_id: 10,
    caption: 'one',
    first_name: 'V',
    message_thread_id: firstSenderThread(),
  }));
  await onMessage(message(undefined, 200, {
    media_group_id: 'g1',
    message_id: 11,
    caption: 'two',
    first_name: 'V',
    message_thread_id: firstSenderThread(),
  }));

  const data = buttons().find((entry) => entry.startsWith('M|'));
  const before = callsOf('copyMessages').length;
  await click(data);

  assert.equal(callsOf('copyMessages').length, before);
  assert.match(callsOf('answerCallbackQuery').at(-1).args.text, /Too fast/);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM pending').get().n, 2);
});

test('owner delivery has a burst cap across senders', async () => {
  await setupLink();
  const link = rawDb().prepare('SELECT * FROM links LIMIT 1').get();
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < 120; i += 1) await store.bumpRate(0, link.owner_key, now);

  await onMessage(message('hello', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  const data = buttons().find((entry) => entry.startsWith('M|'));
  const before = callsOf('copyMessages').length;
  await click(data);

  assert.equal(callsOf('copyMessages').length, before);
  assert.match(callsOf('answerCallbackQuery').at(-1).args.text, /Too fast/);
});

test('an owner album direct reply ships as one batch', async () => {
  const hold = CONFIG.albumHoldMs;
  CONFIG.albumHoldMs = 50;
  try {
    await setupLink();
    await onMessage(message('hello', 200, {
      first_name: 'V',
      message_thread_id: firstSenderThread(),
      message_id: 55,
    }));
    await click(buttons().find((entry) => entry.startsWith('H|')));

    const ownerThread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'history'").get().thread_id;
    const before = callsOf('copyMessages').length;
    await Promise.all([
      onMessage(message(undefined, 100, { media_group_id: 'og1', message_id: 661, message_thread_id: ownerThread })),
      onMessage(message(undefined, 100, { media_group_id: 'og1', message_id: 662, message_thread_id: ownerThread })),
    ]);

    const batches = callsOf('copyMessages').slice(before);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].args.chat_id, 200);
    assert.deepEqual(batches[0].args.message_ids, [661, 662]);
    assert.equal(batches[0].args.reply_to_message_id, undefined);
    assert.equal(callsOf('copyMessage').length, 0);
    assert.equal(callsOf('sendMessage').filter((call) => /Reply sent/.test(call.args.text)).length, 1);
  } finally {
    CONFIG.albumHoldMs = hold;
  }
});

test('an owner album answer ships as one batch', async () => {
  const hold = CONFIG.albumHoldMs;
  CONFIG.albumHoldMs = 50;
  try {
    await setupLink();
    const controls = await deliverAnonymous();
    const data = controls.args.reply_markup.inline_keyboard.flat()
      .find((button) => button.callback_data.startsWith('A|')).callback_data;
    await click(data, 100, controls.args.reply_markup, 104);

    const before = callsOf('copyMessages').length;
    await Promise.all([
      onMessage(message(undefined, 100, { media_group_id: 'og2', message_id: 671, message_thread_id: 104 })),
      onMessage(message(undefined, 100, { media_group_id: 'og2', message_id: 672, message_thread_id: 104 })),
    ]);

    const batches = callsOf('copyMessages').slice(before);
    assert.equal(batches.length, 1);
    assert.deepEqual(batches[0].args.message_ids, [671, 672]);
    assert.equal(callsOf('sendMessage').filter((call) => /Reply sent/.test(call.args.text)).length, 1);
    assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM reply_windows').get().n, 0);
  } finally {
    CONFIG.albumHoldMs = hold;
  }
});

test('an orphaned owner album is taken over and shipped once', async () => {
  const hold = CONFIG.albumHoldMs;
  const margin = CONFIG.albumTakeoverMs;
  CONFIG.albumHoldMs = 20;
  CONFIG.albumTakeoverMs = 20;
  try {
    await setupLink();
    await onMessage(message('hello', 200, {
      first_name: 'V',
      message_thread_id: firstSenderThread(),
      message_id: 55,
    }));
    await click(buttons().find((entry) => entry.startsWith('H|')));

    // The leader died mid-hold: two rows sit with no handler to deliver them.
    const link = rawDb().prepare('SELECT * FROM links LIMIT 1').get();
    const senderKey = await senderKeyFor(link, 200);
    const now = Math.floor(Date.now() / 1000);
    await store.addPending({
      user_key: `album:${link.id}:${senderKey}`, link_id: link.id,
      group_key: 'og9', message_id: 991, created_at: now,
    });
    await store.addPending({
      user_key: `album:${link.id}:${senderKey}`, link_id: link.id,
      group_key: 'og9', message_id: 992, created_at: now,
    });

    const ownerThread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'history'").get().thread_id;
    const before = callsOf('copyMessages').length;
    await onMessage(message(undefined, 100, { media_group_id: 'og9', message_id: 993, message_thread_id: ownerThread }));

    const batches = callsOf('copyMessages').slice(before);
    assert.equal(batches.length, 1);
    assert.deepEqual(batches[0].args.message_ids, [991, 992, 993]);
    assert.equal(callsOf('sendMessage').filter((call) => /Reply sent/.test(call.args.text)).length, 1);
    assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM pending').get().n, 0);
  } finally {
    CONFIG.albumHoldMs = hold;
    CONFIG.albumTakeoverMs = margin;
  }
});

test('a delivery that lands mid-topic-creation is retryable', async () => {
  await setupLink();
  const link = rawDb().prepare('SELECT * FROM links LIMIT 1').get();
  const now = Math.floor(Date.now() / 1000);
  await store.reserveTopic({ link_id: link.id, kind: 'anon', conversation_id: 0, created_at: now });

  await onMessage(message('hello', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  const data = buttons().find((entry) => entry.startsWith('M|'));
  await click(data);
  const edits = callsOf('editMessageText');
  assert.ok(edits.some((call) => /Sent anonymously/.test(call.args.text ?? '')));
  assert.ok(edits.some((call) => /Preparing/.test(call.args.text ?? '')));
  assert.equal(callsOf('copyMessages').length, 0);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM pending').get().n, 1);

  const topic = rawDb().prepare("SELECT id FROM topics WHERE kind = 'anon'").get();
  await store.updateTopic(topic.id, 4242, '', 'open');
  await click(data);
  assert.equal(callsOf('copyMessages').length, 1);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM pending').get().n, 0);
});

test('a failed background delivery edits the confirmation', async () => {
  await setupLink();
  await onMessage(message('hello', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  for (let i = 0; i < 5; i += 1) failNext('copyMessages', { errorCode: 400, description: 'boom' });
  await click(buttons().find((entry) => entry.startsWith('M|')));
  for (let i = 0; i < 6; i += 1) {
    rawDb().prepare('UPDATE jobs SET next_at = 0').run();
    await drain(10);
  }

  const failedEdits = callsOf('editMessageText')
    .filter((call) => call.args.message_id === 999 && /Delivery failed/.test(call.args.text ?? ''));
  assert.equal(failedEdits.length, 1);
  assert.equal(failedEdits[0].args.chat_id, 200);
  assert.equal(callsOf('sendMessage').filter((call) => /Delivery failed/.test(call.args.text ?? '')).length, 0);
});

test('a retired alias is never minted again', async () => {
  await setupLink();
  const link = rawDb().prepare('SELECT * FROM links LIMIT 1').get();
  const senderKey = await senderKeyFor(link, 200);
  const now = Math.floor(Date.now() / 1000);
  await store.insertRetiredAlias(await aliasFp(await makeIndicator(senderKey, 'V', 0)), now);

  await onMessage(message('hello', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  await click(buttons().find((entry) => entry.startsWith('H|')));

  const conv = rawDb().prepare("SELECT * FROM conversations WHERE mode = 'history'").get();
  const label = await conversationLabel(link, conv);
  assert.equal(label, await makeIndicator(senderKey, 'V', 1));
  assert.equal(conv.indicator_fp, await aliasFp(label));
  assert.match(label, /^[a-z]+-[a-z]+-[a-z]+$/);
});

test('revoking a link retires its aliases', async () => {
  await setupLink();
  await onMessage(message('hello', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  await click(buttons().find((entry) => entry.startsWith('H|')));
  const fp = rawDb().prepare("SELECT indicator_fp FROM conversations WHERE mode = 'history'").get().indicator_fp;
  assert.ok(fp);

  await openLinkList();
  await click(buttons().find((entry) => entry.startsWith('D|')), 100);
  await click(buttons().find((entry) => entry.startsWith('V|')), 100);
  await click(buttons().find((entry) => entry.startsWith('K|')), 100);

  assert.equal(await store.isRetiredAlias(fp), true);
});

test('an exhausted alias space fails closed without duplicating', async () => {
  await setupLink();
  const link = rawDb().prepare('SELECT * FROM links LIMIT 1').get();
  const senderKey = await senderKeyFor(link, 200);
  const now = Math.floor(Date.now() / 1000);
  for (let nonce = 0; nonce < 8; nonce += 1) {
    await store.insertRetiredAlias(await aliasFp(await makeIndicator(senderKey, 'V', nonce)), now);
  }

  await onMessage(message('hello', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  await click(buttons().find((entry) => entry.startsWith('H|')));

  assert.equal(callsOf('copyMessages').length, 0);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM jobs').get().n, 0);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM conversations').get().n, 0);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM pending').get().n, 1);
  assert.match(callsOf('sendMessage').at(-1).args.text, /Delivery failed/);
});

test('a dead anon topic is recreated instead of failing', async () => {
  await setupLink();
  await onMessage(message('hello', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  await click(buttons().find((entry) => entry.startsWith('M|')));

  const link = rawDb().prepare('SELECT * FROM links LIMIT 1').get();
  const beforeThread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'anon'").get().thread_id;
  const senderKey = await senderKeyFor(link, 200);
  await deliver(link, 200, senderKey, 'anon', [77], 'V', 100, 0);
  failNext('copyMessages', { errorCode: 400, description: 'Bad Request: message thread not found' });
  await drain();

  const afterThread = rawDb().prepare("SELECT thread_id FROM topics WHERE kind = 'anon'").get()?.thread_id ?? 0;
  assert.ok(afterThread);
  assert.notEqual(afterThread, beforeThread);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM jobs').get().n, 0);
  assert.equal(callsOf('sendMessage').filter((call) => /Delivery failed/.test(call.args.text ?? '')).length, 0);
});

test('a recreated topic keeps its forward kind', async () => {
  await setupLink();
  await onMessage(message('hi', 200, { first_name: 'V', message_thread_id: firstSenderThread() }));
  await click(buttons().find((entry) => entry.startsWith('F|')));

  const link = rawDb().prepare('SELECT * FROM links LIMIT 1').get();
  rawDb().prepare("DELETE FROM topics WHERE kind = 'forward'").run();
  const senderKey = await senderKeyFor(link, 200);
  await deliver(link, 200, senderKey, 'forward', [77, 78], 'V', 100, 0);
  failNext('forwardMessages', { errorCode: 400, description: 'Bad Request: message thread not found' });
  await drain();

  const kinds = rawDb().prepare('SELECT DISTINCT kind AS k FROM topics').all().map((row) => row.k);
  assert.deepEqual(kinds, ['forward']);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM jobs').get().n, 0);
});

test('a job stranded in sending is reaped and delivered', async () => {
  await setupLink();
  const link = rawDb().prepare('SELECT * FROM links LIMIT 1').get();
  const senderKey = await senderKeyFor(link, 200);
  await deliver(link, 200, senderKey, 'anon', [77], 'V', 100, 0, null, null, 'en');
  rawDb().prepare("UPDATE jobs SET state = 'sending', claim = 'dead', claimed_at = 0").run();

  assert.equal(callsOf('copyMessages').length, 0);
  await drain();
  assert.equal(callsOf('copyMessages').length, 1);
  assert.equal(rawDb().prepare('SELECT COUNT(*) AS n FROM jobs').get().n, 0);
});

test('a permanently failing delivery notifies the sender', async () => {
  await setupLink();
  const link = rawDb().prepare('SELECT * FROM links LIMIT 1').get();
  const senderKey = await senderKeyFor(link, 200);
  await deliver(link, 200, senderKey, 'anon', [77], 'V', 100, 0, null, null, 'en');
  for (let i = 0; i < 5; i += 1) failNext('copyMessages', { errorCode: 400, description: 'boom' });
  for (let i = 0; i < 6; i += 1) {
    rawDb().prepare('UPDATE jobs SET next_at = 0').run();
    await drain(10);
  }

  const notices = callsOf('sendMessage').filter((call) => /Delivery failed/.test(call.args.text ?? ''));
  assert.ok(notices.some((call) => call.args.chat_id === 200));
  assert.ok(notices.every((call) => call.args.chat_id !== 100));
});
