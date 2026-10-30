import { api } from 'sdk';
import { CONFIG } from '../lib/config.js';
import * as store from '../lib/store.js';
import * as ids from '../lib/ids.js';
import * as crypto from '../lib/crypto.js';
import * as render from '../lib/render.js';
import { t, normalizeLang } from '../lib/i18n.js';
import { linkDek, ownerChatId, sealAction, linkMemo, linkToken } from '../lib/keys.js';
import { KEYS, CURRENT_KEK_VERSION } from '../lib/secret.js';
import { renameTopics, ensureSenderTopic } from '../lib/topics.js';
import { drain } from '../lib/queue.js';
import { deepLink, userKeyFor, chatKeyFor, sessionKeyFrom, senderKeyFrom, sessionKeyFor, senderKeyFor, tokenLookupFor } from '../lib/links.js';
import { linksMenu } from '../lib/menu.js';

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
  };
  const [anon, history, forward] = await Promise.all([
    sealAction(link, 'mode', { ...payload, mode: 'anon' }, now, CONFIG.modeTtlSeconds),
    sealAction(link, 'mode', { ...payload, mode: 'history' }, now, CONFIG.modeTtlSeconds),
    sealAction(link, 'mode', { ...payload, mode: 'forward' }, now, CONFIG.modeTtlSeconds),
  ]);
  await send(senderId, t(lang, 'chooseMode'), {
    reply_markup: render.modeKeyboard(lang, {
      anon: `M|${anon.prefix}|${anon.suffix}`,
      history: `H|${history.prefix}|${history.suffix}`,
      forward: `F|${forward.prefix}|${forward.suffix}`,
    }, current),
    reply_to_message_id: messageId,
    ...(threadId ? { message_thread_id: threadId } : {}),
  });
}

async function startOwner(msg, lang, now) {
  const chatId = msg.chat.id;
  const ownerKey = await userKeyFor(chatId);
  const created = await store.ensureOwner(ownerKey, now, lang);
  await send(chatId, render.welcome(lang));
  if (!created) {
    const links = await store.listLinks(ownerKey);
    if (!links.length) await send(chatId, t(lang, 'noLinks'));
    return;
  }

  const link = await createLink(ownerKey, chatId, CONFIG.defaultMemo, now);
  if (!link) {
    await send(chatId, t(lang, 'capReached', { cap: CONFIG.maxLinksPerOwner }));
    return;
  }
  const url = await deepLink(await linkToken(link));
  await send(chatId, render.linkIntro(lang, url, await linkMemo(link)), {
    reply_markup: render.linkButtons(url),
  });
}

async function openLink(msg, token, lang, now) {
  const chatId = msg.chat.id;
  const ownerKey = await userKeyFor(chatId);
  const link = await store.findLinkByLookup(await tokenLookupFor(token.trim().toLowerCase()));
  if (!link) {
    const retired = await store.isRetired(await ids.tokenFp(token));
    return send(chatId, t(lang, retired ? 'linkInactive' : 'linkNotFound'));
  }
  if (link.state !== 'active') return send(chatId, t(lang, 'linkInactive'));
  if (link.owner_key === ownerKey) return send(chatId, t(lang, 'ownLink'));

  const base = await chatKeyFor(chatId);
  await store.upsertSession(await sessionKeyFrom(base), link.id, now);
  const senderKey = await senderKeyFrom(base, link.id);
  const talk = await ensureSenderTopic(link, chatId, senderKey, now);
  if (talk.created && talk.thread) {
    await send(chatId, t(lang, 'senderTopicHint', { token: await linkToken(link) }));
  }
  return send(chatId, t(lang, 'prompt'), talk.thread ? { message_thread_id: talk.thread } : {});
}

async function newLink(msg, arg, lang, now) {
  const chatId = msg.chat.id;
  const ownerKey = await userKeyFor(chatId);
  await store.ensureOwner(ownerKey, now, lang);
  const link = await createLink(ownerKey, chatId, arg, now);
  if (!link) return send(chatId, t(lang, 'capReached', { cap: CONFIG.maxLinksPerOwner }));
  const url = await deepLink(await linkToken(link));
  return send(chatId, render.linkIntro(lang, url, await linkMemo(link)), {
    reply_markup: render.linkButtons(url),
  });
}

async function listLinks(msg, lang, now) {
  const chatId = msg.chat.id;
  const ownerKey = await userKeyFor(chatId);
  const menu = await linksMenu(lang, ownerKey, now);
  await send(chatId, menu.text, { reply_markup: menu.keyboard });
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
  if (head === '/about') return send(chatId, render.about(lang));
  if (head === '/mode') {
    const session = await store.getSession(await sessionKeyFor(chatId));
    if (!session) return send(chatId, t(lang, 'startFromLink'));
    await store.setSessionMode(session.user_key, null, now);
    return send(chatId, t(lang, 'modeCleared'));
  }
  return undefined;
}

async function replyToWindow(msg, window, lang, now) {
  const chatId = msg.chat.id;
  const link = await store.getLink(window.link_id);
  if (!link) {
    await store.closeReplyWindow(window.owner_key);
    return send(chatId, t(lang, 'answerExpired'));
  }
  const dek = await linkDek(link);
  const target = Number(await crypto.decrypt(
    dek,
    window.target_ct,
    window.target_nonce,
    `link:${link.id}:reply:v1`,
  ));

  const senderKey = await senderKeyFor(link, target);
  const talk = await ensureSenderTopic(link, target, senderKey, now);
  const thread = talk.thread;
  const base = { chat_id: target, from_chat_id: chatId, message_id: msg.message_id };
  if (thread) base.message_thread_id = thread;
  else base.reply_to_message_id = window.original_id;

  try {
    await api.copyMessage(base);
  } catch {
    try {
      await api.copyMessage({ chat_id: target, from_chat_id: chatId, message_id: msg.message_id });
    } catch {
      return send(chatId, t(lang, 'failed'));
    }
  }
  await store.closeReplyWindow(window.owner_key);
  return send(chatId, t(lang, 'answerSent'));
}

async function plain(msg, lang, now) {
  const chatId = msg.chat.id;
  const ownerKey = await userKeyFor(chatId);

  const memoLink = await store.getMemoState(ownerKey);
  if (memoLink) {
    if (typeof msg.text !== 'string') {
      return send(chatId, t(lang, 'memoPrompt', { max: CONFIG.maxMemoLength }));
    }
    const link = await store.getLink(memoLink);
    if (link) {
      const memoText = ids.sanitizeMemo(msg.text);
      const dek = await linkDek(link);
      const sealed = await crypto.encrypt(dek, memoText, `link:${link.token_lookup}:memo:v1`);
      await store.updateMemo(link.id, `enc:${sealed.nonce}:${sealed.ct}`);
      const updated = await store.getLink(link.id);
      await renameTopics(updated, await ownerChatId(updated));
    }
    await store.clearMemoState(ownerKey);
    return send(chatId, t(lang, 'memoChanged'));
  }

  const window = await store.getReplyWindow(ownerKey, now);
  if (window) return replyToWindow(msg, window, lang, now);

  const base = await chatKeyFor(chatId);
  const sessionKey = await sessionKeyFrom(base);
  const session = await store.getSession(sessionKey);
  if (!session) {
    const owner = await store.getOwner(ownerKey);
    return send(chatId, t(lang, owner ? 'answerOnly' : 'startFromLink'));
  }

  const link = await store.getLink(session.link_id);
  if (!link || link.state !== 'active') {
    await store.deleteSession(sessionKey);
    return send(chatId, t(lang, 'linkInactive'));
  }

  const senderKey = await senderKeyFrom(base, link.id);
  const globalKey = await userKeyFor(chatId);
  if (await store.hasBlock(link.owner_key, link.id, senderKey)
      || await store.hasBlock(link.owner_key, 0, globalKey)) {
    return send(chatId, t(lang, 'blockedNotice'));
  }

  if (CONFIG.throttlePerMinute > 0) {
    const count = await store.bumpRate(link.id, senderKey, now);
    if (count > CONFIG.throttlePerMinute) return send(chatId, t(lang, 'throttle'));
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
    msg.message_id, msg.message_thread_id ?? 0, session.mode, now);
}

export default async function onMessage(update) {
  try {
    const msg = update;
    if (!msg?.chat || !msg?.from || msg.from.is_bot) return;
    const now = nowSec();
    await store.sweepActionTokens(now);
    await store.sweepPending(now - 86_400);
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
