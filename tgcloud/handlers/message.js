import { api } from 'sdk';
import { CONFIG } from '../lib/config.js';
import * as store from '../lib/store.js';
import * as ids from '../lib/ids.js';
import * as crypto from '../lib/crypto.js';
import * as render from '../lib/render.js';
import { t, normalizeLang } from '../lib/i18n.js';
import { linkDek, ownerChatId, sealAction, linkMemo, linkToken, sealTopicName } from '../lib/keys.js';
import { KEYS, CURRENT_KEK_VERSION } from '../lib/secret.js';
import { renameTopics, ensureSenderTopic, recreateSenderTopic } from '../lib/topics.js';
import { drain } from '../lib/queue.js';
import { deepLink, userKeyFor, chatKeyFor, sessionKeyFrom, senderKeyFrom, senderKeyFor, sessionKeyFor, tokenLookupFor } from '../lib/links.js';
import { configureBotOnce } from '../lib/bot-config.js';
import { EMOJI, CALLBACK } from '../lib/constants.js';
import { linksMenu, requestMemo } from '../lib/menu.js';

const nowSec = () => Math.floor(Date.now() / 1000);

function send(chatId, text, extra = {}) {
  return api.sendMessage({
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...extra,
  });
}

function sendHere(msg, text, extra = {}) {
  return send(msg.chat.id, text, {
    ...(msg.message_thread_id ? { message_thread_id: msg.message_thread_id } : {}),
    ...extra,
  });
}

async function nextToken() {
  for (let i = 0; i < 6; i += 1) {
    const token = ids.makeToken();
    const fingerprint = await ids.tokenFp(token);
    if (await store.isRetired(fingerprint)) continue;
    if (await store.findLinkByLookup(await tokenLookupFor(token))) continue;
    return token;
  }
  throw new Error('could not allocate a token');
}

async function createLink(ownerKey, chatId, memo, now) {
  const slot = await store.claimSlot(ownerKey, CONFIG.maxLinksPerOwner, now);
  if (slot === null) return null;
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const token = await nextToken();
      const tokenLookup = await tokenLookupFor(token);
      const dek = crypto.randomBytes(32);
      const wrapped = await crypto.encrypt(KEYS[CURRENT_KEK_VERSION], dek, `link:${tokenLookup}:dek:v1`);
      const chat = await crypto.encrypt(dek, String(chatId), `link:${tokenLookup}:owner_chat:v1`);
      const sealedToken = await crypto.encrypt(dek, token, `link:${tokenLookup}:token:v1`);
      const memoText = ids.sanitizeMemo(memo);
      const sealedMemo = await crypto.encrypt(dek, memoText, `link:${tokenLookup}:memo:v1`);
      try {
        const link = await store.insertLink({
          token_lookup: tokenLookup,
          token_ct: sealedToken.ct,
          token_nonce: sealedToken.nonce,
          memo: `enc:${sealedMemo.nonce}:${sealedMemo.ct}`,
          slot,
          owner_key: ownerKey,
          owner_chat_ct: chat.ct,
          owner_chat_nonce: chat.nonce,
          dek_wrapped: wrapped.ct,
          dek_nonce: wrapped.nonce,
          kek_version: CURRENT_KEK_VERSION,
          created_at: now,
        });
        if (!link) throw new Error('link insert not found');
        return link;
      } catch (err) {
        if (!/unique|constraint/i.test(String(err))) throw err;
      }
    }
    throw new Error('could not allocate a link');
  } catch (err) {
    await store.releaseSlot(ownerKey, slot);
    throw err;
  }
}

async function askMode(link, senderId, userKey, senderKey, groupKey, firstName, lang, messageId, threadId, current, now) {
  const payload = {
    link_id: link.id,
    user_key: userKey,
    sender_id: senderId,
    sender_key: senderKey,
    group_key: groupKey,
    first_name: firstName,
    thread_id: threadId,
  };
  // One sealed token backs all three buttons; the mode letter is the only difference.
  const sealed = await sealAction(link, 'mode', payload, now, CONFIG.modeTtlSeconds);
  const data = `${sealed.prefix}${CALLBACK.SEP}${sealed.suffix}`;
  await send(senderId, t(lang, 'chooseMode'), {
    reply_markup: render.modeKeyboard(lang, {
      anon: `${CALLBACK.MODE_ANON}${CALLBACK.SEP}${data}`,
      history: `${CALLBACK.MODE_HISTORY}${CALLBACK.SEP}${data}`,
      forward: `${CALLBACK.MODE_FORWARD}${CALLBACK.SEP}${data}`,
    }, current),
    reply_to_message_id: messageId,
    ...(threadId ? { message_thread_id: threadId } : {}),
  });
}

async function startOwner(msg, lang, now) {
  const chatId = msg.chat.id;
  void configureBotOnce();
  const ownerKey = await userKeyFor(chatId);
  const created = await store.ensureOwner(ownerKey, now, lang);
  await sendHere(msg, render.welcome(lang));
  if (!created) {
    const links = await store.listLinks(ownerKey);
    if (!links.length) await sendHere(msg, t(lang, 'noLinks'));
    return;
  }

  const link = await createLink(ownerKey, chatId, CONFIG.defaultMemo, now);
  if (!link) {
    await sendHere(msg, t(lang, 'capReached', { cap: CONFIG.maxLinksPerOwner }));
    return;
  }
  const url = await deepLink(await linkToken(link));
  await sendHere(msg, render.linkIntro(lang, url, await linkMemo(link)), {
    reply_markup: render.linkButtons(url),
  });
}

async function openLink(msg, token, lang, now) {
  const chatId = msg.chat.id;
  const ownerKey = await userKeyFor(chatId);
  const link = await store.findLinkByLookup(await tokenLookupFor(token.trim().toLowerCase()));
  if (!link) {
    const retired = await store.isRetired(await ids.tokenFp(token));
    return sendHere(msg, t(lang, retired ? 'deleteNotice' : 'linkNotFound'));
  }
  if (link.state !== 'active') return sendHere(msg, t(lang, 'linkInactive'));
  if (link.owner_key === ownerKey) return sendHere(msg, t(lang, 'ownLink'));

  const base = await chatKeyFor(chatId);
  await store.upsertSession(await sessionKeyFrom(base), link.id, now);
  const senderKey = await senderKeyFrom(base, link.id);
  const talk = await ensureSenderTopic(link, chatId, senderKey, now);
  if (talk.pending) return send(chatId, t(lang, 'topicPreparing'));
  if (!talk.thread) return send(chatId, t(lang, 'topicFailed'));
  if (talk.created) {
    try {
      await send(chatId, t(lang, 'senderTopicHint', { token: await linkToken(link) }));
    } catch {
      // the prompt below is the important message
    }
  }
  try {
    return await send(chatId, t(lang, 'prompt'), { message_thread_id: talk.thread });
  } catch (err) {
    if (!/thread|topic/i.test(String(err?.description ?? err))) throw err;
    const fresh = await recreateSenderTopic(link, chatId, senderKey, now);
    if (!fresh) return send(chatId, t(lang, 'topicFailed'));
    return send(chatId, t(lang, 'prompt'), { message_thread_id: fresh });
  }
}

async function newLink(msg, arg, lang, now) {
  const chatId = msg.chat.id;
  const ownerKey = await userKeyFor(chatId);
  await store.ensureOwner(ownerKey, now, lang);
  const link = await createLink(ownerKey, chatId, arg, now);
  if (!link) return sendHere(msg, t(lang, 'capReached', { cap: CONFIG.maxLinksPerOwner }));
  const url = await deepLink(await linkToken(link));
  return sendHere(msg, render.linkIntro(lang, url, await linkMemo(link)), {
    reply_markup: render.linkButtons(url),
  });
}

async function listLinks(msg, lang, now) {
  const chatId = msg.chat.id;
  const ownerKey = await userKeyFor(chatId);
  const menu = await linksMenu(lang, ownerKey, now);
  await sendHere(msg, menu.text, { reply_markup: menu.keyboard });
}

function stripTopicPrefix(text) {
  const direction = new RegExp(`^\\u200E?(${EMOJI.down}|${EMOJI.up})\\s*`);
  const mode = new RegExp(`^(${EMOJI.history}|${EMOJI.anon}|${EMOJI.forward})\\s*`);
  return String(text).replace(direction, '').replace(mode, '').trim();
}

async function renameTopic(msg, arg, lang) {
  const chatId = msg.chat.id;
  const threadId = msg.message_thread_id ?? 0;
  if (!threadId) return send(chatId, t(lang, 'renameNoTopic'));
  const label = ids.cleanLabel(stripTopicPrefix(arg), 60);
  if (!label) return send(chatId, t(lang, 'renameUsage'), { message_thread_id: threadId });

  const ownerKey = await userKeyFor(chatId);
  const topic = await store.getOwnedTopicByThread(ownerKey, threadId);
  if (topic) {
    const link = await store.getLink(topic.link_id);
    if (!link) return send(chatId, t(lang, 'renameNoTopic'), { message_thread_id: threadId });
    const name = render.customTopicName(topic.kind, label, await linkMemo(link));
    try {
      await api.editForumTopic({ chat_id: chatId, message_thread_id: threadId, name });
      const sealed = await sealTopicName(link, topic.id, label);
      await store.updateTopic(topic.id, threadId, sealed, topic.state);
    } catch {
      return send(chatId, t(lang, 'renameFailed'), { message_thread_id: threadId });
    }
    return send(chatId, t(lang, 'renamed', { name: ids.escapeHtml(name) }), { message_thread_id: threadId });
  }

  const base = await chatKeyFor(chatId);
  for (const row of await store.getSenderTopicsByThread(threadId)) {
    if (await senderKeyFrom(base, row.link_id) !== row.sender_key) continue;
    const link = await store.getLink(row.link_id);
    if (!link) continue;
    const name = render.customSenderTopicName(label);
    try {
      await api.editForumTopic({ chat_id: chatId, message_thread_id: threadId, name });
    } catch {
      return send(chatId, t(lang, 'renameFailed'), { message_thread_id: threadId });
    }
    return send(chatId, t(lang, 'renamed', { name: ids.escapeHtml(name) }), { message_thread_id: threadId });
  }
  return send(chatId, t(lang, 'renameNoTopic'), { message_thread_id: threadId });
}

async function command(msg, lang, now) {
  const [head, ...rest] = String(msg.text ?? '').trim().split(/\s+/);
  const arg = rest.join(' ').trim();
  const chatId = msg.chat.id;

  if (head === '/start') {
    if (arg) return openLink(msg, arg, lang, now);
    return startOwner(msg, lang, now);
  }
  if (head === '/newlink') return newLink(msg, arg, lang, now);
  if (head === '/links') return listLinks(msg, lang, now);
  if (head === '/help') return sendHere(msg, t(lang, 'help'));
  if (head === '/about') return sendHere(msg, render.about(lang));
  if (head === '/rename') return renameTopic(msg, arg, lang);
  if (head === '/mode') {
    const session = await store.getSession(await sessionKeyFor(chatId));
    if (!session) return sendHere(msg, t(lang, 'startFromLink'));
    await store.setSessionMode(session.user_key, null, now);
    return sendHere(msg, t(lang, 'modeCleared'));
  }
  return undefined;
}

function replyTarget(text) {
  if (String(text).startsWith('{')) {
    try {
      const value = JSON.parse(text);
      return { chatId: Number(value.chat_id), threadId: Number(value.thread_id) || 0 };
    } catch {
      // old plain format below
    }
  }
  return { chatId: Number(text), threadId: 0 };
}

async function replyToWindow(msg, window, lang, now) {
  const chatId = msg.chat.id;
  const link = await store.getLink(window.link_id);
  if (!link) {
    await store.closeReplyWindow(window.owner_key);
    return sendHere(msg, t(lang, 'answerExpired'));
  }
  const dek = await linkDek(link);
  const target = replyTarget(await crypto.decrypt(
    dek,
    window.target_ct,
    window.target_nonce,
    `link:${link.id}:reply:v1`,
  ));

  const senderKey = await senderKeyFor(link, target.chatId);
  let thread = target.threadId;
  if (!thread) {
    const talk = await ensureSenderTopic(link, target.chatId, senderKey, now);
    if (talk.pending) return sendHere(msg, t(lang, 'failed'));
    thread = talk.thread;
  }

  const base = { chat_id: target.chatId, from_chat_id: chatId, message_id: msg.message_id };
  if (thread) base.message_thread_id = thread;
  else base.reply_to_message_id = window.original_id;

  try {
    await api.copyMessage(base);
  } catch (err) {
    if (!thread) return sendHere(msg, t(lang, 'failed'));
    const description = String(err?.description ?? err).toLowerCase();
    if (!/thread|topic/.test(description)) return sendHere(msg, t(lang, 'failed'));

    let copied = false;
    if (/closed/.test(description)) {
      try {
        await api.reopenForumTopic({ chat_id: target.chatId, message_thread_id: thread });
        await api.copyMessage(base);
        copied = true;
      } catch {
        // fall through to a fresh topic
      }
    }
    if (!copied) {
      const fresh = await recreateSenderTopic(link, target.chatId, senderKey, now);
      if (!fresh) return sendHere(msg, t(lang, 'failed'));
      base.message_thread_id = fresh;
      try {
        await api.copyMessage(base);
      } catch {
        return sendHere(msg, t(lang, 'failed'));
      }
    }
  }

  await store.closeReplyWindow(window.owner_key);
  return sendHere(msg, t(lang, 'answerSent'));
}

async function senderTopicFor(base, threadId) {
  for (const row of await store.getSenderTopicsByThread(threadId)) {
    if (await senderKeyFrom(base, row.link_id) !== row.sender_key) continue;
    return { link: await store.getLink(row.link_id), senderKey: row.sender_key };
  }
  return null;
}

async function plain(msg, lang, now) {
  const chatId = msg.chat.id;
  const ownerKey = await userKeyFor(chatId);
  const state = await store.getOwnerState(ownerKey);

  if (state?.memo_link_id) {
    if (typeof msg.text !== 'string') {
      try {
        await api.deleteMessage({ chat_id: chatId, message_id: msg.message_id });
      } catch {
        // message already gone
      }
      const link = await store.getLink(state.memo_link_id);
      if (link) await requestMemo(link, lang);
      return undefined;
    }
    const link = await store.getLink(state.memo_link_id);
    if (link) {
      const memoText = ids.sanitizeMemo(msg.text);
      const dek = await linkDek(link);
      const sealed = await crypto.encrypt(dek, memoText, `link:${link.token_lookup}:memo:v1`);
      await store.updateMemo(link.id, `enc:${sealed.nonce}:${sealed.ct}`);
      const updated = await store.getLink(link.id);
      const chat = await ownerChatId(updated);
      await renameTopics(updated, chat);
      await Promise.all([
        state.memo_message_id
          ? api.deleteMessage({ chat_id: chat, message_id: state.memo_message_id }).catch(() => {})
          : null,
        api.deleteMessage({ chat_id: chatId, message_id: msg.message_id }).catch(() => {}),
        store.clearMemoState(ownerKey),
      ]);
    } else {
      await store.clearMemoState(ownerKey);
    }
    return sendHere(msg, t(lang, 'memoChanged'));
  }

  if (state?.reply_link_id) {
    if (state.expires_at > now) {
      if (state.reply_thread_id === (msg.message_thread_id ?? 0)) {
        return replyToWindow(msg, { ...state, link_id: state.reply_link_id }, lang, now);
      }
      // Another thread: leave the window for the thread that opened it.
    } else {
      await store.closeReplyWindow(ownerKey);
    }
  }

  const base = await chatKeyFor(chatId);
  const sessionKey = await sessionKeyFrom(base);
  let link;
  let senderKey;
  let current = null;

  if (msg.message_thread_id) {
    const owned = await store.getOwnedTopicByThread(ownerKey, msg.message_thread_id);
    if (owned) return sendHere(msg, t(lang, 'answerOnly'));

    const talk = await senderTopicFor(base, msg.message_thread_id);
    if (!talk?.link || talk.link.state !== 'active') {
      return sendHere(msg, t(lang, 'deleteNotice'));
    }
    link = talk.link;
    senderKey = talk.senderKey;
    const session = await store.getSession(sessionKey);
    if (session?.link_id === link.id) current = session.mode;
  } else {
    const session = await store.getSessionWithLink(sessionKey);
    if (!session) {
      return sendHere(msg, t(lang, state?.owner_key ? 'answerOnly' : 'startFromLink'));
    }
    link = session;
    if (link.state !== 'active') {
      await store.deleteSession(sessionKey);
      return sendHere(msg, t(lang, 'linkInactive'));
    }
    senderKey = await senderKeyFrom(base, link.id);

    // Senders never deliver from All: the session is a convenience, not a
    // routing authority. A link topic keeps every message bound to one link.
    const topic = await store.getSenderTopic(link.id, senderKey);
    if (topic?.state === 'open' && topic.thread_id) {
      const token = await linkToken(link);
      const url = await deepLink(token);
      return sendHere(msg, t(lang, 'senderTopicHint', { token }), {
        reply_markup: { inline_keyboard: [[{ text: t(lang, 'open'), url }]] },
      });
    }
    const url = await deepLink(await linkToken(link));
    const key = topic?.state === 'creating' ? 'topicPreparing' : 'senderTopicMissing';
    return sendHere(msg, t(lang, key), {
      reply_markup: { inline_keyboard: [[{ text: t(lang, 'open'), url }]] },
    });
  }

  if (await store.isBlockedBy(link.owner_key, link.id, senderKey, ownerKey)) {
    return sendHere(msg, t(lang, 'blockedNotice'));
  }

  if (CONFIG.throttlePerMinute > 0) {
    const count = await store.bumpRate(link.id, senderKey, now);
    if (count > CONFIG.throttlePerMinute) return sendHere(msg, t(lang, 'throttle'));
  }

  const groupKey = msg.media_group_id ? String(msg.media_group_id) : `s${msg.message_id}`;
  const added = await store.addPending({
    user_key: sessionKey,
    link_id: link.id,
    group_key: groupKey,
    message_id: msg.message_id,
    created_at: now,
  });

  if (!added) return undefined;
  if (msg.media_group_id) {
    const pending = await store.listPending(sessionKey, groupKey);
    if (pending.length > 1) return undefined;
  }

  const firstName = msg.from?.first_name ?? '';
  // shortcut: every message asks once; the last mode is marked, and the tap is
  // also the completion barrier for albums (no timers on the platform).
  return askMode(link, chatId, sessionKey, senderKey, groupKey, firstName, lang,
    msg.message_id, msg.message_thread_id ?? 0, current, now);
}

export default async function onMessage(update) {
  try {
    const msg = update;
    if (!msg?.chat || !msg?.from || msg.from.is_bot) return;
    const now = nowSec();
    // Housekeeping does not need to run on every update; expired rows are also
    // rejected and removed on use.
    if (Math.random() < 0.02) {
      await Promise.all([
        store.sweepActionTokens(now),
        store.sweepPending(now - 86_400),
      ]);
    }
    const lang = normalizeLang(msg.from.language_code);

    if (typeof msg.text === 'string' && msg.text.startsWith('/')) return await command(msg, lang, now);
    return await plain(msg, lang, now);
  } catch {
    return undefined;
  } finally {
    try {
      await drain();
    } catch {
      // the platform records failures; the bot writes no logs
    }
  }
}
