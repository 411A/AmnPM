import { api } from 'sdk';
import { CONFIG } from '../lib/config.js';
import * as store from '../lib/store.js';
import * as ids from '../lib/ids.js';
import * as crypto from '../lib/crypto.js';
import { t, normalizeLang } from '../lib/i18n.js';
import { linkDek, openAction, ownerChatId, sealAction, linkMemo, linkToken } from '../lib/keys.js';
import { closeLinkTopics } from '../lib/topics.js';
import { deliver } from '../lib/delivery.js';
import { homeMenu, linksMenu, linkMenu, editMenu } from '../lib/menu.js';
import { deepLink, userKeyFor } from '../lib/links.js';
import * as render from '../lib/render.js';
import { drain } from '../lib/queue.js';

const nowSec = () => Math.floor(Date.now() / 1000);

const KINDS = {
  M: 'mode', H: 'mode', F: 'mode',
  A: 'answer', R: 'read', B: 'block',
  V: 'revoke', K: 'revoke_ok', E: 'memo', D: 'menu',
};
const SENDER_KINDS = new Set(['M', 'H', 'F']);
const OWNER_KINDS = new Set(['A', 'R', 'B', 'V', 'K', 'E', 'D']);

function answer(q, text, alert = false) {
  return api.answerCallbackQuery({
    callback_query_id: q.id,
    ...(text ? { text } : {}),
    ...(alert ? { show_alert: true } : {}),
  });
}

async function removeReadButton(q) {
  if (!q.message?.reply_markup?.inline_keyboard) return;
  const keyboard = q.message.reply_markup.inline_keyboard
    .map((row) => row.filter((button) => !String(button.callback_data).startsWith('R|')))
    .filter((row) => row.length);
  await api.editMessageReplyMarkup({
    chat_id: q.message.chat.id,
    message_id: q.message.message_id,
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function toggleBlockButton(q, blockedLink, blockedAll, lang) {
  const keyboard = q.message?.reply_markup?.inline_keyboard;
  if (!keyboard) return;
  if (keyboard[1]?.[0]) {
    keyboard[1][0].text = blockedLink ? t(lang, 'btnUnblockLink') : t(lang, 'btnBlockLink');
  }
  if (keyboard[1]?.[1]) {
    keyboard[1][1].text = blockedAll ? t(lang, 'btnUnblockAll') : t(lang, 'btnBlockAll');
  }
  await api.editMessageReplyMarkup({
    chat_id: q.message.chat.id,
    message_id: q.message.message_id,
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function mode(q, k, opened, lang, now) {
  const p = opened.payload;
  const link = opened.link;
  if (link.state !== 'active') return answer(q, t(lang, 'linkInactive'));

  const globalKey = await userKeyFor(p.sender_id);
  if (await store.hasBlock(link.owner_key, link.id, p.sender_key)
      || await store.hasBlock(link.owner_key, 0, globalKey)) {
    await store.clearPending(p.user_key, p.group_key);
    await store.deleteActionToken(opened.row.prefix);
    return answer(q, t(lang, 'blockedNotice'));
  }

  const pending = await store.listPending(p.user_key, p.group_key);
  if (!pending.length) return answer(q, t(lang, 'answerExpired'));

  const chosen = k === 'M' ? 'anon' : k === 'H' ? 'history' : 'forward';
  const session = await store.getSession(p.user_key);
  if (session?.link_id === link.id) await store.setSessionMode(p.user_key, chosen, now);

  const target = await deliver(link, p.sender_id, p.sender_key, chosen,
    pending.map((row) => row.message_id), p.first_name, now);
  await store.clearPending(p.user_key, p.group_key);
  await store.deleteActionToken(opened.row.prefix);

  const text = chosen === 'anon'
    ? t(lang, 'sentAnon')
    : chosen === 'history'
      ? t(lang, 'sentHistory', { indicator: target.indicator })
      : t(lang, 'sentForward');

  const replyTo = q.message?.reply_to_message?.message_id;
  if (q.message?.chat?.id && q.message?.message_id) {
    try {
      await api.deleteMessage({ chat_id: q.message.chat.id, message_id: q.message.message_id });
    } catch {
      // already gone
    }
  }
  await api.sendMessage({
    chat_id: p.sender_id,
    ...(q.message?.message_thread_id ? { message_thread_id: q.message.message_thread_id } : {}),
    text,
    ...(replyTo ? { reply_to_message_id: replyTo } : {}),
  });
  return answer(q);
}

async function replyWindow(q, opened, lang, now) {
  const p = opened.payload;
  const link = opened.link;
  const dek = await linkDek(link);
  const sealed = await crypto.encrypt(dek, String(p.sender_chat_id), `link:${link.id}:reply:v1`);
  await store.openReplyWindow({
    owner_key: link.owner_key,
    link_id: link.id,
    target_ct: sealed.ct,
    target_nonce: sealed.nonce,
    original_id: p.original_id,
    expires_at: now + CONFIG.replyWindowSeconds,
  });
  const chatId = q.message?.chat?.id ?? (await ownerChatId(link));
  const thread = q.message?.message_thread_id;
  await api.sendMessage({
    chat_id: chatId,
    ...(thread ? { message_thread_id: thread } : {}),
    text: t(lang, 'answerWindow', { seconds: CONFIG.replyWindowSeconds }),
  });
  return answer(q);
}

async function read(q, opened, lang) {
  const p = opened.payload;
  try {
    await api.setMessageReaction({
      chat_id: p.sender_chat_id,
      message_id: p.message_id,
      reaction: [{ type: 'emoji', emoji: '👀' }],
    });
    await removeReadButton(q);
    return answer(q);
  } catch {
    return answer(q, t(lang, 'readFailed'), true);
  }
}

async function block(q, opened, lang, now) {
  const p = opened.payload;
  const link = opened.link;
  const globalKey = await userKeyFor(p.sender_chat_id);
  const scope = p.scope === 'all' ? 0 : link.id;
  const key = p.scope === 'all' ? globalKey : p.sender_key;
  const blocked = await store.hasBlock(link.owner_key, scope, key);

  if (blocked) await store.clearBlock(link.owner_key, scope, key);
  else await store.setBlock(link.owner_key, scope, key, now);

  const blockedLink = await store.hasBlock(link.owner_key, link.id, p.sender_key);
  const blockedAll = await store.hasBlock(link.owner_key, 0, globalKey);
  await toggleBlockButton(q, blockedLink, blockedAll, lang);

  const nowBlocked = !blocked;
  const labelKey = p.scope === 'all'
    ? (nowBlocked ? 'blockedAll' : 'unblockedAll')
    : (nowBlocked ? 'blockedLink' : 'unblockedLink');
  return answer(q, t(lang, labelKey));
}

async function revokePrompt(q, opened, lang, now) {
  const link = opened.link;
  const memoText = await linkMemo(link);
  const confirm = await sealAction(link, 'revoke_ok', { link_id: link.id }, now);
  await editMenu(q, {
    text: t(lang, 'revokeConfirm', { memo: ids.escapeHtml(memoText) }),
    keyboard: {
      inline_keyboard: [
        [{ text: t(lang, 'back'), callback_data: 'm:links' }],
        [{
          text: t(lang, 'confirm'),
          callback_data: `K|${confirm.prefix}|${confirm.suffix}`,
          style: 'danger',
        }],
      ],
    },
  });
  return answer(q);
}

async function revoke(q, opened, lang, now) {
  const link = opened.link;
  const owner = await store.getOwner(link.owner_key);
  const chat = await ownerChatId(link);
  const token = await linkToken(link);
  const url = await deepLink(token);

  await closeLinkTopics(link, chat, owner?.lang ?? lang);
  await store.insertRetired(await ids.tokenFp(token), now);
  await store.deleteLinkScoped(link.id);
  await store.deleteLinkRow(link.id);
  await store.releaseSlot(link.owner_key, link.slot);
  await store.clearMemoState(link.owner_key);

  const text = t(owner?.lang ?? lang, 'revoked', { link: ids.escapeHtml(url) });
  try {
    await api.editMessageText({
      chat_id: q.message.chat.id,
      message_id: q.message.message_id,
      text,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [] },
    });
  } catch {
    await api.sendMessage({
      chat_id: chat,
      ...(q.message?.message_thread_id ? { message_thread_id: q.message.message_thread_id } : {}),
      text,
      parse_mode: 'HTML',
    });
  }
  return answer(q, t(lang, 'revokedShort'));
}

async function memoPrompt(q, opened, lang) {
  const link = opened.link;
  await store.setMemoState(link.owner_key, link.id);
  const chatId = q.message?.chat?.id ?? (await ownerChatId(link));
  const thread = q.message?.message_thread_id;
  await api.sendMessage({
    chat_id: chatId,
    ...(thread ? { message_thread_id: thread } : {}),
    text: t(lang, 'memoPrompt', { max: CONFIG.maxMemoLength }),
  });
  return answer(q);
}

async function menu(q, data, lang, now) {
  if (!q.message?.chat?.id || !q.message?.message_id) return answer(q);

  if (data === 'm:home') {
    await editMenu(q, homeMenu(lang));
    return answer(q);
  }
  if (data === 'm:links') {
    await editMenu(q, await linksMenu(lang, await userKeyFor(q.from.id), now));
    return answer(q);
  }
  if (data === 'm:help') {
    await editMenu(q, {
      text: t(lang, 'help'),
      keyboard: { inline_keyboard: [[{ text: t(lang, 'back'), callback_data: 'm:home' }]] },
    });
    return answer(q);
  }
  if (data === 'm:about') {
    await editMenu(q, {
      text: render.about(lang),
      keyboard: { inline_keyboard: [[{ text: t(lang, 'back'), callback_data: 'm:home' }]] },
    });
    return answer(q);
  }
  return answer(q);
}

export default async function onCallback(update) {
  try {
    const q = update;
    if (!q?.data || !q.from) return;
    const now = nowSec();
    const lang = normalizeLang(q.from.language_code);
    const [k, prefix, suffix] = String(q.data).split('|');

    if (k.startsWith('m:')) return await menu(q, k, lang, now);
    if (k === 'X') return await answer(q, t(lang, 'cancelled'));

    const opened = await openAction(prefix, suffix);
    const expected = KINDS[k];
    if (!opened || !expected || opened.row.kind !== expected) {
      return await answer(q, t(lang, 'linkNotFound'));
    }

    // Action tokens are bearer capabilities; bind them to the intended actor.
    if (SENDER_KINDS.has(k)) {
      if (Number(opened.payload.sender_id) !== Number(q.from.id)) {
        return await answer(q, t(lang, 'linkNotFound'));
      }
    } else if (OWNER_KINDS.has(k)) {
      if (await userKeyFor(q.from.id) !== opened.link.owner_key) {
        return await answer(q, t(lang, 'linkNotFound'));
      }
    }

    if (k === 'M' || k === 'H' || k === 'F') return await mode(q, k, opened, lang, now);
    if (k === 'A') return await replyWindow(q, opened, lang, now);
    if (k === 'R') return await read(q, opened, lang);
    if (k === 'B') return await block(q, opened, lang, now);
    if (k === 'V') return await revokePrompt(q, opened, lang, now);
    if (k === 'K') return await revoke(q, opened, lang, now);
    if (k === 'E') return await memoPrompt(q, opened, lang);
    if (k === 'D') {
      await editMenu(q, await linkMenu(lang, opened.link, now));
      return await answer(q);
    }
    return await answer(q);
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
