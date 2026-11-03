import { api } from 'sdk';
import { CONFIG } from '../lib/config.js';
import * as store from '../lib/store.js';
import * as ids from '../lib/ids.js';
import * as crypto from '../lib/crypto.js';
import * as render from '../lib/render.js';
import { t, normalizeLang } from '../lib/i18n.js';
import { linkDek, ownerChatId, sealAction, linkMemo, linkToken, sealTopicName, topicLabel, conversationChatId } from '../lib/keys.js';
import { KEYS, CURRENT_KEK_VERSION } from '../lib/secret.js';
import { renameTopics, ensureSenderTopic, recreateSenderTopic, isTopicNameTaken } from '../lib/topics.js';
import { drain } from '../lib/queue.js';
import { deepLink, ownerSalt, userKeyFor, chatKeyFor, sessionKeyFrom, senderKeyFrom, senderKeyFor, sessionKeyFor, tokenLookupFor } from '../lib/links.js';
import { configureBotOnce } from '../lib/bot-config.js';
import { EMOJI, CALLBACK } from '../lib/constants.js';
import { parseModes } from '../lib/modes.js';
import { homeMenu, requestMemo } from '../lib/menu.js';

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

function sendRich(chatId, html, extra = {}) {
  return api.sendRichMessage({
    chat_id: chatId,
    rich_message: { html },
    ...extra,
  });
}

function sendRichHere(msg, html, extra = {}) {
  return sendRich(msg.chat.id, html, {
    ...(msg.message_thread_id ? { message_thread_id: msg.message_thread_id } : {}),
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

// Numbered defaults: "link 1", "link 2", reusing the lowest free number after a revoke.
async function nextDefaultMemo(ownerKey) {
  const used = new Set();
  for (const link of await store.listLinks(ownerKey)) {
    const memo = await linkMemo(link);
    const rest = memo.slice(CONFIG.defaultMemo.length + 1);
    if (memo.startsWith(`${CONFIG.defaultMemo} `) && /^\d+$/.test(rest)) {
      used.add(Number(rest));
    }
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return `${CONFIG.defaultMemo} ${n}`;
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
  // One sealed token backs every visible button; the mode letter is the only difference.
  const sealed = await sealAction(link, 'mode', payload, now, CONFIG.modeTtlSeconds);
  const data = `${sealed.prefix}${CALLBACK.SEP}${sealed.suffix}`;
  const modes = parseModes((await store.getOwner(link.owner_key))?.modes);
  const guide = modes.map((mode) => t(lang, {
    anon: 'modeGuideAnon',
    history: 'modeGuideHistory',
    forward: 'modeGuideForward',
  }[mode])).join('\n');
  await send(senderId, t(lang, 'chooseMode', { guide }), {
    reply_markup: render.modeKeyboard(lang, {
      anon: `${CALLBACK.MODE_ANON}${CALLBACK.SEP}${data}`,
      history: `${CALLBACK.MODE_HISTORY}${CALLBACK.SEP}${data}`,
      forward: `${CALLBACK.MODE_FORWARD}${CALLBACK.SEP}${data}`,
    }, current, modes),
    reply_to_message_id: messageId,
    ...(threadId ? { message_thread_id: threadId } : {}),
  });
}

async function startOwner(msg, lang, now) {
  const chatId = msg.chat.id;
  void configureBotOnce();
  const ownerKey = await userKeyFor(chatId);
  await store.ensureOwner(ownerKey, now, lang);
  const main = (await store.listLinks(ownerKey)).at(-1);
  const extra = {};
  if (main) {
    const url = await deepLink(await linkToken(main));
    extra.reply_markup = {
      inline_keyboard: [[{ text: t(lang, 'openMain'), url }]],
    };
  }
  return sendHere(msg, render.welcome(lang), extra);
}

async function openLink(msg, token, lang, now) {
  const chatId = msg.chat.id;
  const salt = await ownerSalt();
  const ownerKey = await userKeyFor(chatId, salt);
  // One normalized form for both checks, or case and spacing reveal whether a
  // token was revoked instead of never existing.
  const normalized = token.trim().toLowerCase();
  const link = await store.findLinkByLookup(await tokenLookupFor(normalized, salt));
  if (!link) {
    const retired = await store.isRetired(await ids.tokenFp(normalized));
    return sendHere(msg, t(lang, retired ? 'deleteNotice' : 'linkNotFound'));
  }
  if (link.state !== 'active') return sendHere(msg, t(lang, 'linkInactive'));
  if (link.owner_key === ownerKey) return sendHere(msg, t(lang, 'ownLink'));

  const base = await chatKeyFor(chatId, salt);
  await store.upsertSession(await sessionKeyFrom(base), link.id, now);
  const senderKey = await senderKeyFrom(base, link.id);
  const talk = await ensureSenderTopic(link, chatId, senderKey, now);
  if (talk.pending) return sendHere(msg, t(lang, 'topicPreparing'));
  if (!talk.thread) return sendHere(msg, t(lang, 'topicFailed'));
  if (talk.created) {
    try {
      await sendHere(msg, t(lang, 'senderTopicHint', { token: await linkToken(link) }));
    } catch {
      // the prompt below is the important message
    }
  }
  try {
    return await send(chatId, t(lang, 'prompt'), { message_thread_id: talk.thread });
  } catch (err) {
    if (!/thread|topic/i.test(String(err?.description ?? err))) throw err;
    const fresh = await recreateSenderTopic(link, chatId, senderKey, now);
    if (!fresh) return sendHere(msg, t(lang, 'topicFailed'));
    return send(chatId, t(lang, 'prompt'), { message_thread_id: fresh });
  }
}

// Memo labels are the visible topic names, so two links must never share one:
// identical labels make topics indistinguishable and memo edits look broken.
async function memoInUse(ownerKey, memo, exceptLinkId = 0) {
  const wanted = String(memo).trim().toLowerCase();
  if (!wanted) return false;
  for (const link of await store.listLinks(ownerKey)) {
    if (link.id === exceptLinkId) continue;
    if ((await linkMemo(link)).trim().toLowerCase() === wanted) return true;
  }
  return false;
}

async function newLink(msg, arg, lang, now) {
  const chatId = msg.chat.id;
  const ownerKey = await userKeyFor(chatId);
  await store.ensureOwner(ownerKey, now, lang);
  if (arg && await memoInUse(ownerKey, ids.sanitizeMemo(arg))) {
    return sendHere(msg, t(lang, 'memoTaken'));
  }
  const link = await createLink(ownerKey, chatId, arg || await nextDefaultMemo(ownerKey), now);
  if (!link) return sendHere(msg, t(lang, 'capReached', { cap: CONFIG.maxLinksPerOwner }));
  const url = await deepLink(await linkToken(link));
  return sendHere(msg, render.linkIntro(lang, url, await linkMemo(link)), {
    reply_markup: render.linkButtons(url),
  });
}

async function settingsPage(msg, lang) {
  const menu = homeMenu(lang);
  await sendHere(msg, menu.text, { reply_markup: menu.keyboard });
}

function stripTopicPrefix(text) {
  const direction = new RegExp(`^\\u200E?(${EMOJI.receiver}|${EMOJI.sender})\\s*`);
  const mode = new RegExp(`^(${EMOJI.history}|${EMOJI.anon}|${EMOJI.forward})\\s*`);
  return String(text).replace(direction, '').replace(mode, '').trim();
}

function rightsError(err) {
  return /admin|right|privileg|permission|forbidden|chat_admin_required/i
    .test(String(err?.description ?? err ?? ''));
}

async function renameTopic(msg, arg, lang) {
  const chatId = msg.chat.id;
  const threadId = msg.message_thread_id ?? 0;
  if (!threadId) return send(chatId, t(lang, 'renameNoTopic'));
  const label = ids.cleanLabel(stripTopicPrefix(arg), 60);
  if (!label) return send(chatId, t(lang, 'renameUsage'), { message_thread_id: threadId });

  const salt = await ownerSalt();
  const ownerKey = await userKeyFor(chatId, salt);
  const topic = await store.getOwnedTopicByThread(ownerKey, threadId);
  if (topic) {
    const link = await store.getLink(topic.link_id);
    if (!link) return send(chatId, t(lang, 'renameNoTopic'), { message_thread_id: threadId });
    // Re-setting the same label is a no-op success without an API call. An
    // unreadable stored name simply means "not the same", never a crash.
    let current = '';
    try {
      current = await topicLabel(link, topic);
    } catch {
      current = '';
    }
    if (current === label) {
      const name = render.customTopicName(topic.kind, label, await linkMemo(link));
      return send(chatId, t(lang, 'renamed', { name: ids.escapeHtml(name) }), { message_thread_id: threadId });
    }
    if (await isTopicNameTaken(ownerKey, link, label, topic.id)) {
      return send(chatId, t(lang, 'renameTaken'), { message_thread_id: threadId });
    }
    const name = render.customTopicName(topic.kind, label, await linkMemo(link));
    const edit = () => api.editForumTopic({ chat_id: chatId, message_thread_id: threadId, name });
    const failed = (err) => {
      const wait = err?.parameters?.retry_after ?? err?.retry_after;
      const secs = typeof wait === 'number' && Number.isFinite(wait) ? Math.max(1, Math.floor(wait)) : 0;
      // Topic renames are strictly flood-controlled; a short wait is worth one
      // retry, a long one is reported with its duration instead of burning calls.
      if (secs > 0) {
        return send(chatId, t(lang, 'renameFailedRetry', { seconds: secs }), { message_thread_id: threadId });
      }
      return send(chatId, t(lang, 'renameFailed'), { message_thread_id: threadId });
    };
    try {
      await edit();
    } catch (err) {
      if (rightsError(err)) {
        return send(chatId, t(lang, 'renameRights'), { message_thread_id: threadId });
      }
      const wait = err?.parameters?.retry_after ?? err?.retry_after;
      if (typeof wait === 'number' && wait > 0 && wait <= 5) {
        await new Promise((resolve) => setTimeout(resolve, Math.max(1, Math.floor(wait)) * 1000));
        try {
          await edit();
        } catch (retryErr) {
          if (rightsError(retryErr)) {
            return send(chatId, t(lang, 'renameRights'), { message_thread_id: threadId });
          }
          return failed(retryErr);
        }
      } else {
        return failed(err);
      }
    }
    try {
      const sealed = await sealTopicName(link, topic.id, label);
      await store.updateTopic(topic.id, threadId, sealed, topic.state);
    } catch {
      // the display changed but was not stored; a retry heals both.
      return send(chatId, t(lang, 'renameFailed'), { message_thread_id: threadId });
    }
    return send(chatId, t(lang, 'renamed', { name: ids.escapeHtml(name) }), { message_thread_id: threadId });
  }

  const base = await chatKeyFor(chatId, salt);
  for (const row of await store.getSenderTopicsByThread(threadId)) {
    if (await senderKeyFrom(base, row.link_id) !== row.sender_key) continue;
    const link = await store.getLink(row.link_id);
    if (!link) continue;
    const name = render.customSenderTopicName(label);
    try {
      await api.editForumTopic({ chat_id: chatId, message_thread_id: threadId, name });
    } catch (err) {
      return send(chatId, t(lang, rightsError(err) ? 'renameRights' : 'renameFailed'), { message_thread_id: threadId });
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
  if (head === '/settings') return settingsPage(msg, lang);
  if (head === '/help') return sendRichHere(msg, t(lang, 'help'));
  if (head === '/privacy') return sendHere(msg, t(lang, 'privacy'));
  if (head === '/about') return sendRichHere(msg, render.about(lang));
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

async function copyToSender(msg, link, chatId, senderKey, thread, replyTo, now, batchIds = null) {
  const attempt = (withReply, targetThread) => {
    if (batchIds) {
      // copyMessages has no reply_to parameter, so an album ships as one
      // batch without threading while single messages keep their reply.
      const base = { chat_id: chatId, from_chat_id: msg.chat.id, message_ids: batchIds };
      if (targetThread) base.message_thread_id = targetThread;
      return api.copyMessages(base);
    }
    const base = { chat_id: chatId, from_chat_id: msg.chat.id, message_id: msg.message_id };
    if (targetThread) base.message_thread_id = targetThread;
    if (withReply && replyTo) base.reply_to_message_id = replyTo;
    return api.copyMessage(base);
  };

  let lastError;
  try {
    await attempt(Boolean(replyTo), thread);
    return true;
  } catch (err) {
    lastError = err;
  }
  if (replyTo) {
    try {
      await attempt(false, thread);
      return true;
    } catch (err) {
      lastError = err;
    }
  }
  if (!thread) return false;

  const description = String(lastError?.description ?? lastError).toLowerCase();
  if (!/thread|topic/.test(description)) return false;

  if (/closed/.test(description)) {
    try {
      await api.reopenForumTopic({ chat_id: chatId, message_thread_id: thread });
      await attempt(false, thread);
      return true;
    } catch {
      // fall through to a fresh topic
    }
  }

  const fresh = await recreateSenderTopic(link, chatId, senderKey, now);
  if (!fresh) return false;
  try {
    await attempt(false, fresh);
    return true;
  } catch {
    return false;
  }
}

// Owner albums arrive as separate updates sharing one media_group_id. The
// first inserted row leads: it holds briefly so the followers land in the
// same batch, then ships everything in one copyMessages call. No extra
// button is needed; media_group_id already identifies the group. The take is
// atomic, so a late insert either joins this batch or starts the next one.
// Returns true when this call delivered (the caller confirms), false on
// failure, and null when another call owns the batch (the caller stays
// silent so the album gets exactly one confirmation).
async function copyAlbumToSender(msg, link, chatId, senderKey, thread, replyTo, now) {
  if (!msg.media_group_id) {
    return copyToSender(msg, link, chatId, senderKey, thread, replyTo, now);
  }
  const userKey = `album:${link.id}:${senderKey}`;
  const groupKey = String(msg.media_group_id);
  const added = await store.addPending({
    user_key: userKey,
    link_id: link.id,
    group_key: groupKey,
    message_id: msg.message_id,
    created_at: now,
  });
  if (!added) return null;
  // The leader holds so followers land in the same batch. A follower waits
  // out the hold, then takes over only when the leader died mid-hold; the
  // atomic take hands the batch to exactly one caller either way.
  const hold = await store.isFirstPending(userKey, groupKey, msg.message_id)
    ? CONFIG.albumHoldMs
    : CONFIG.albumHoldMs + CONFIG.albumTakeoverMs;
  await new Promise((resolve) => setTimeout(resolve, hold));
  const batch = await store.takePending(userKey, groupKey);
  if (!batch.length) return null;
  if (batch.length === 1) {
    return copyToSender({ ...msg, message_id: batch[0] }, link, chatId, senderKey, thread, replyTo, now);
  }
  return copyToSender(msg, link, chatId, senderKey, thread, 0, now, batch);
}

async function replyToWindow(msg, window, lang, now) {
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

  const salt = await ownerSalt();
  const senderKey = await senderKeyFor(link, target.chatId, salt);
  if (await store.isBlockedBy(link.owner_key, link.id, senderKey, await userKeyFor(target.chatId, salt))) {
    await store.closeReplyWindow(window.owner_key);
    if (window.reply_prompt_id) {
      await api.deleteMessage({ chat_id: msg.chat.id, message_id: window.reply_prompt_id }).catch(() => {});
    }
    return sendHere(msg, t(lang, 'blockedReply'));
  }
  let thread = target.threadId;
  if (!thread) {
    const talk = await ensureSenderTopic(link, target.chatId, senderKey, now);
    if (talk.pending) return sendHere(msg, t(lang, 'failed'));
    thread = talk.thread;
  }

  const copied = await copyAlbumToSender(
    msg,
    link,
    target.chatId,
    senderKey,
    thread,
    window.original_id,
    now,
  );
  if (copied === null) return undefined;
  if (!copied) return sendHere(msg, t(lang, 'failed'));

  if (window.reply_prompt_id) {
    try {
      await api.deleteMessage({
        chat_id: await ownerChatId(link),
        message_id: window.reply_prompt_id,
      });
    } catch {
      // already gone
    }
  }
  await store.closeReplyWindow(window.owner_key);
  return sendHere(msg, t(lang, 'answerSent'));
}

async function directReply(msg, link, conversation, lang, now) {
  if (!conversation.sender_chat_ct) {
    if (await store.markConversationSetupPrompted(conversation.id)) {
      return sendHere(msg, t(lang, 'replySetup'));
    }
    return sendHere(msg, t(lang, 'answerOnly'));
  }
  let targetChat = 0;
  try {
    targetChat = await conversationChatId(link, conversation);
  } catch {
    return sendHere(msg, t(lang, 'answerOnly'));
  }
  if (!targetChat) return sendHere(msg, t(lang, 'answerOnly'));
  if (await store.isBlockedBy(link.owner_key, link.id, conversation.sender_key, await userKeyFor(targetChat))) {
    return sendHere(msg, t(lang, 'blockedReply'));
  }

  const talk = await ensureSenderTopic(link, targetChat, conversation.sender_key, now);
  if (talk.pending) return sendHere(msg, t(lang, 'preparing'));
  if (!talk.thread) return sendHere(msg, t(lang, 'failed'));

  const copied = await copyAlbumToSender(
    msg,
    link,
    targetChat,
    conversation.sender_key,
    talk.thread,
    conversation.last_message_id,
    now,
  );
  if (copied === null) return undefined;
  if (!copied) return sendHere(msg, t(lang, 'failed'));
  return sendHere(msg, t(lang, 'answerSent'));
}

async function senderTopicFor(base, threadId) {
  for (const row of await store.getSenderTopicsByThread(threadId)) {
    if (await senderKeyFrom(base, row.link_id) !== row.sender_key) continue;
    return { link: await store.getLink(row.link_id), senderKey: row.sender_key };
  }
  return null;
}

// onMessage only routes clean "/cmd" text to command(). A command typed with
// leading whitespace or sent as a media caption would otherwise fall through
// to plain() — an owner's "/rename" would be copied to the sender instead of
// renaming the topic. Known heads route to command(); anything else keeps the
// old delivery behavior so no message is ever silently dropped.
const COMMAND_HEADS = new Set([
  '/start', '/newlink', '/settings', '/help', '/privacy', '/about', '/rename', '/mode',
]);

function asCommand(msg) {
  const raw = typeof msg.text === 'string' ? msg.text
    : (typeof msg.caption === 'string' ? msg.caption : '');
  const head = raw.trimStart().split(/\s+/, 1)[0] ?? '';
  if (!COMMAND_HEADS.has(head)) return null;
  return { ...msg, text: raw.trim() };
}

async function plain(msg, lang, now) {
  const chatId = msg.chat.id;
  const salt = await ownerSalt();
  const ownerKey = await userKeyFor(chatId, salt);
  const state = await store.getOwnerState(ownerKey);

  const cmd = asCommand(msg);
  if (cmd) return command(cmd, lang, now);

  if (state?.memo_link_id) {
    if (typeof msg.text !== 'string') {
      try {
        await api.deleteMessage({ chat_id: chatId, message_id: msg.message_id });
      } catch {
        // message already gone
      }
      const link = await store.getLink(state.memo_link_id);
      if (link) await requestMemo(link, lang, msg.message_thread_id ?? 0);
      return undefined;
    }
    const link = await store.getLink(state.memo_link_id);
    const memoText = ids.sanitizeMemo(msg.text);
    if (!link) {
      await store.clearMemoState(ownerKey);
      return sendHere(msg, t(lang, 'deleteNotice'));
    }
    if (await memoInUse(ownerKey, memoText, link.id)) {
      // Keep the prompt: the owner can send a different label right away.
      return sendHere(msg, t(lang, 'memoTaken'));
    }
    const dek = await linkDek(link);
    const sealed = await crypto.encrypt(dek, memoText, `link:${link.token_lookup}:memo:v1`);
    await store.updateMemo(link.id, `enc:${sealed.nonce}:${sealed.ct}`);
    const updated = await store.getLink(link.id);
    const chat = await ownerChatId(updated);
    let renamed = { failed: 0, rights: false };
    try {
      renamed = await renameTopics(updated, chat);
    } catch {
      // The memo itself is saved; report the rename problem instead of dying.
      renamed = { failed: 1, rights: false };
    }
    await Promise.all([
      state.memo_message_id
        ? api.deleteMessage({ chat_id: chat, message_id: state.memo_message_id }).catch(() => {})
        : null,
      api.deleteMessage({ chat_id: chatId, message_id: msg.message_id }).catch(() => {}),
      store.clearMemoState(ownerKey),
    ]);
    if (renamed.failed > 0) {
      return sendHere(msg, t(lang, renamed.rights ? 'renameRights' : 'memoPartial', { count: renamed.failed }));
    }
    return sendHere(msg, t(lang, 'memoChanged', { memo: ids.escapeHtml(memoText) }));
  }

  if (state?.reply_link_id) {
    if (state.expires_at !== 0 && state.expires_at <= now) {
      await store.closeReplyWindow(ownerKey);
    } else if (state.reply_thread_id === (msg.message_thread_id ?? 0)) {
      return replyToWindow(msg, { ...state, link_id: state.reply_link_id }, lang, now);
    }
  }

  const base = await chatKeyFor(chatId, salt);
  const sessionKey = await sessionKeyFrom(base);
  let link;
  let senderKey;
  let current = null;

  if (msg.message_thread_id) {
    const owned = await store.getOwnedTopicByThread(ownerKey, msg.message_thread_id);
    if (owned) {
      if (owned.kind === 'anon' || msg.chat.type !== 'private') {
        return sendHere(msg, t(lang, 'answerOnly'));
      }
      const link = await store.getLink(owned.link_id);
      const conversation = await store.getConversationById(owned.conversation_id);
      if (!link || link.state !== 'active' || !conversation) {
        return sendHere(msg, t(lang, 'answerOnly'));
      }
      return directReply(msg, link, conversation, lang, now);
    }

    const talk = await senderTopicFor(base, msg.message_thread_id);
    if (!talk?.link || talk.link.state !== 'active') {
      return sendHere(msg, t(lang, 'topicDeleted'));
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
    // Only the earliest inserted pending row for the album asks for a mode,
    // even when every item arrived before the first handler checked.
    if (!(await store.isFirstPending(sessionKey, groupKey, msg.message_id))) return undefined;
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
        store.sweepRateLimits(now - 86_400),
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
