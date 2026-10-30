import { api } from 'sdk';
import { CONFIG } from '../lib/config.js';
import * as store from '../lib/store.js';
import * as ids from '../lib/ids.js';
import * as crypto from '../lib/crypto.js';
import { t, normalizeLang } from '../lib/i18n.js';
import { linkDek, openAction, ownerChatId, sealAction, linkMemo, linkToken, sealConversationChat } from '../lib/keys.js';
import { closeLinkTopics } from '../lib/topics.js';
import { deliver } from '../lib/delivery.js';
import { homeMenu, linksMenu, linkMenu, editMenu, requestMemo } from '../lib/menu.js';
import { deepLink, userKeyFor } from '../lib/links.js';
import * as render from '../lib/render.js';
import { drain } from '../lib/queue.js';
import { CALLBACK, EMOJI } from '../lib/constants.js';

const nowSec = () => Math.floor(Date.now() / 1000);

const KINDS = {
  [CALLBACK.MODE_ANON]: 'mode',
  [CALLBACK.MODE_HISTORY]: 'mode',
  [CALLBACK.MODE_FORWARD]: 'mode',
  [CALLBACK.ANSWER]: 'answer',
  [CALLBACK.READ]: 'read',
  [CALLBACK.BLOCK]: 'block',
  [CALLBACK.REVOKE]: 'revoke',
  [CALLBACK.REVOKE_OK]: 'revoke_ok',
  [CALLBACK.MEMO]: 'memo',
  [CALLBACK.MENU_LINK]: 'menu',
};
const SENDER_KINDS = new Set([CALLBACK.MODE_ANON, CALLBACK.MODE_HISTORY, CALLBACK.MODE_FORWARD]);
const OWNER_KINDS = new Set([
  CALLBACK.ANSWER, CALLBACK.READ, CALLBACK.BLOCK,
  CALLBACK.REVOKE, CALLBACK.REVOKE_OK, CALLBACK.MEMO, CALLBACK.MENU_LINK,
]);

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
    .map((row) => row.filter((button) => !String(button.callback_data).startsWith(`${CALLBACK.READ}${CALLBACK.SEP}`)))
    .filter((row) => row.length);
  await api.editMessageReplyMarkup({
    chat_id: q.message.chat.id,
    message_id: q.message.message_id,
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function toggleBlockButton(q, blockedLink, blockedAll, lang, nextLink, nextAll) {
  const keyboard = q.message?.reply_markup?.inline_keyboard;
  if (!keyboard) return;
  if (keyboard[1]?.[0]) {
    keyboard[1][0].text = blockedLink ? t(lang, 'btnUnblockLink') : t(lang, 'btnBlockLink');
    if (nextLink) {
      keyboard[1][0].callback_data =
        `${CALLBACK.BLOCK}${CALLBACK.SEP}${nextLink.prefix}${CALLBACK.SEP}${nextLink.suffix}`;
    }
  }
  if (keyboard[1]?.[1]) {
    keyboard[1][1].text = blockedAll ? t(lang, 'btnUnblockAll') : t(lang, 'btnBlockAll');
    if (nextAll) {
      keyboard[1][1].callback_data =
        `${CALLBACK.BLOCK}${CALLBACK.SEP}${nextAll.prefix}${CALLBACK.SEP}${nextAll.suffix}`;
    }
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

  if (await store.isBlockedBy(link.owner_key, link.id, p.sender_key, await userKeyFor(p.sender_id))) {
    await store.clearPending(p.user_key, p.group_key);
    await store.deleteActionToken(opened.row.prefix);
    return answer(q, t(lang, 'blockedNotice'));
  }

  const claimed = await store.claimPending(p.user_key, p.group_key);
  if (!claimed) return answer(q, t(lang, 'answerExpired'));

  const pending = await store.listPending(p.user_key, p.group_key);
  if (!pending.length) {
    await store.releasePending(p.user_key, p.group_key);
    return answer(q, t(lang, 'answerExpired'));
  }

  // Stop the button spinner now; delivery and cleanup continue behind it.
  await answer(q);

  const chosen = k === CALLBACK.MODE_ANON ? 'anon' : k === CALLBACK.MODE_HISTORY ? 'history' : 'forward';
  const session = await store.getSession(p.user_key);
  if (session?.link_id === link.id) await store.setSessionMode(p.user_key, chosen, now);

  let target;
  try {
    target = await deliver(link, p.sender_id, p.sender_key, chosen,
      pending.map((row) => row.message_id), p.first_name, now, p.thread_id ?? 0);
  } catch {
    await store.releasePending(p.user_key, p.group_key);
    await api.sendMessage({
      chat_id: p.sender_id,
      ...(p.thread_id ? { message_thread_id: p.thread_id } : {}),
      text: t(lang, 'failed'),
    });
    return undefined;
  }

  if (target.pending) {
    await store.releasePending(p.user_key, p.group_key);
    await api.sendMessage({
      chat_id: p.sender_id,
      ...(p.thread_id ? { message_thread_id: p.thread_id } : {}),
      text: t(lang, 'preparing'),
    });
    return undefined;
  }

  const text = chosen === 'anon'
    ? t(lang, 'sentAnon')
    : chosen === 'history'
      ? t(lang, 'sentHistory', { indicator: target.indicator })
      : t(lang, 'sentForward');

  const replyTo = q.message?.reply_to_message?.message_id;
  await Promise.all([
    store.clearPending(p.user_key, p.group_key),
    store.deleteActionToken(opened.row.prefix),
    q.message?.chat?.id && q.message?.message_id
      ? api.deleteMessage({ chat_id: q.message.chat.id, message_id: q.message.message_id }).catch(() => {})
      : null,
    api.sendMessage({
      chat_id: p.sender_id,
      ...(q.message?.message_thread_id ? { message_thread_id: q.message.message_thread_id } : {}),
      text,
      ...(replyTo ? { reply_to_message_id: replyTo } : {}),
    }),
  ]);
  return undefined;
}

async function replyWindow(q, opened, lang, now) {
  const p = opened.payload;
  const link = opened.link;
  if (await store.getMemoState(link.owner_key)) {
    return answer(q, t(lang, 'memoBusy'), true);
  }
  let conversationId = p.conversation_id ?? 0;
  if (!conversationId) {
    const topicThread = q.message?.message_thread_id ?? p.owner_thread_id ?? 0;
    if (topicThread) {
      const topic = await store.getOwnedTopicByThread(link.owner_key, topicThread);
      if (topic?.conversation_id) conversationId = topic.conversation_id;
    }
  }
  if (conversationId) {
    const conversation = await store.getConversationById(conversationId);
    if (conversation) {
      if (!conversation.sender_chat_ct) {
        try {
          await store.setConversationChat(
            conversation.id,
            await sealConversationChat(link, p.sender_chat_id, conversation.sender_key, conversation.mode),
          );
        } catch {
          // direct replies stay unavailable; Answer still works
        }
      }
      if (p.original_id) {
        await store.setConversationLastMessage(conversation.id, p.original_id);
      }
    }
  }
  const dek = await linkDek(link);
  const target = JSON.stringify({
    chat_id: p.sender_chat_id,
    thread_id: p.sender_thread_id ?? 0,
  });
  const sealed = await crypto.encrypt(dek, target, `link:${link.id}:reply:v1`);
  const ownerChat = await ownerChatId(link);
  const previous = await store.getReplyWindow(link.owner_key, now);
  const thread = q.message?.chat?.id === ownerChat
    ? (q.message?.message_thread_id ?? p.owner_thread_id ?? 0)
    : (p.owner_thread_id ?? 0);
  const openedWindow = await store.openReplyWindow({
    owner_key: link.owner_key,
    link_id: link.id,
    target_ct: sealed.ct,
    target_nonce: sealed.nonce,
    thread_id: thread,
    original_id: p.original_id,
  });
  if (!openedWindow) return answer(q, t(lang, 'replyBusy'), true);
  if (previous?.prompt_message_id) {
    try {
      await api.deleteMessage({ chat_id: ownerChat, message_id: previous.prompt_message_id });
    } catch {
      // already gone
    }
  }
  const sent = await api.sendMessage({
    chat_id: ownerChat,
    ...(thread ? { message_thread_id: thread } : {}),
    text: t(lang, 'answerWindow'),
    reply_markup: {
      inline_keyboard: [[{ text: t(lang, 'cancel'), callback_data: CALLBACK.CANCEL }]],
    },
  });
  await store.setReplyPrompt(link.owner_key, sent.message_id);
  return answer(q);
}

async function read(q, opened, lang) {
  const p = opened.payload;
  try {
    await api.setMessageReaction({
      chat_id: p.sender_chat_id,
      message_id: p.message_id,
      reaction: [{ type: 'emoji', emoji: EMOJI.eyes }],
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
  if (!(await store.deleteActionToken(opened.row.prefix))) {
    return answer(q, t(lang, 'linkNotFound'));
  }
  const globalKey = await userKeyFor(p.sender_chat_id);
  const scope = p.scope === 'all' ? 0 : link.id;
  const key = p.scope === 'all' ? globalKey : p.sender_key;
  const blocked = await store.hasBlock(link.owner_key, scope, key);
  const desired = p.blocked === undefined ? !blocked : Boolean(p.blocked);

  if (desired) await store.setBlock(link.owner_key, scope, key, now);
  else await store.clearBlock(link.owner_key, scope, key);

  const blockedLink = await store.hasBlock(link.owner_key, link.id, p.sender_key);
  const blockedAll = await store.hasBlock(link.owner_key, 0, globalKey);

  const dek = await linkDek(link);
  const base = {
    link_id: link.id,
    sender_key: p.sender_key,
    sender_chat_id: p.sender_chat_id,
  };
  const [nextLink, nextAll] = await Promise.all([
    sealAction(link, 'block', { ...base, scope: 'link', blocked: !blockedLink },
      now, CONFIG.actionTtlSeconds, dek),
    sealAction(link, 'block', { ...base, scope: 'all', blocked: !blockedAll },
      now, CONFIG.actionTtlSeconds, dek),
  ]);
  await toggleBlockButton(q, blockedLink, blockedAll, lang, nextLink, nextAll);

  const labelKey = p.scope === 'all'
    ? (desired ? 'blockedAll' : 'unblockedAll')
    : (desired ? 'blockedLink' : 'unblockedLink');
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
        [{ text: t(lang, 'back'), callback_data: CALLBACK.LINKS }],
        [{
          text: t(lang, 'confirm'),
          callback_data: `${CALLBACK.REVOKE_OK}${CALLBACK.SEP}${confirm.prefix}${CALLBACK.SEP}${confirm.suffix}`,
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
  const memoState = await store.getMemoState(link.owner_key);
  const replyState = await store.getReplyWindow(link.owner_key, now);

  if (memoState?.memo_link_id === link.id && memoState.memo_message_id) {
    try {
      await api.deleteMessage({ chat_id: chat, message_id: memoState.memo_message_id });
    } catch {
      // already gone
    }
  }
  if (replyState?.link_id === link.id && replyState.prompt_message_id) {
    try {
      await api.deleteMessage({ chat_id: chat, message_id: replyState.prompt_message_id });
    } catch {
      // already gone
    }
  }
  await store.setLinkState(link.id, 'revoked');
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

async function memoPrompt(q, opened, lang, now) {
  if (await store.getReplyWindow(opened.link.owner_key, now)) {
    return answer(q, t(lang, 'replyBusy'), true);
  }
  const openedMemo = await requestMemo(opened.link, lang);
  if (!openedMemo) return answer(q, t(lang, 'replyBusy'), true);
  return answer(q);
}

async function menu(q, data, lang, now) {
  if (!q.message?.chat?.id || !q.message?.message_id) return answer(q);

  if (data === CALLBACK.HOME) {
    await editMenu(q, homeMenu(lang));
    return answer(q);
  }
  if (data === CALLBACK.LINKS) {
    await editMenu(q, await linksMenu(lang, await userKeyFor(q.message.chat.id), now));
    return answer(q);
  }
  if (data === CALLBACK.HELP) {
    await editMenu(q, {
      text: t(lang, 'help'),
      keyboard: { inline_keyboard: [[{ text: t(lang, 'back'), callback_data: CALLBACK.HOME }]] },
    });
    return answer(q);
  }
  if (data === CALLBACK.ABOUT) {
    await editMenu(q, {
      text: render.about(lang),
      keyboard: { inline_keyboard: [[{ text: t(lang, 'back'), callback_data: CALLBACK.HOME }]] },
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
    const [k, prefix, suffix] = String(q.data).split(CALLBACK.SEP);

    if (k.startsWith(CALLBACK.MENU_PREFIX)) return await menu(q, k, lang, now);
    if (k === CALLBACK.CANCEL) {
      if (q.message?.chat?.id) {
        await store.closeReplyWindow(await userKeyFor(q.message.chat.id));
        if (q.message.message_id) {
          try {
            await api.deleteMessage({
              chat_id: q.message.chat.id,
              message_id: q.message.message_id,
            });
          } catch {
            // already gone
          }
        }
      }
      return await answer(q, t(lang, 'cancelled'));
    }

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

    if (k === CALLBACK.MODE_ANON || k === CALLBACK.MODE_HISTORY || k === CALLBACK.MODE_FORWARD) {
      return await mode(q, k, opened, lang, now);
    }
    if (k === CALLBACK.ANSWER) return await replyWindow(q, opened, lang, now);
    if (k === CALLBACK.READ) return await read(q, opened, lang);
    if (k === CALLBACK.BLOCK) return await block(q, opened, lang, now);
    if (k === CALLBACK.REVOKE) return await revokePrompt(q, opened, lang, now);
    if (k === CALLBACK.REVOKE_OK) return await revoke(q, opened, lang, now);
    if (k === CALLBACK.MEMO) return await memoPrompt(q, opened, lang, now);
    if (k === CALLBACK.MENU_LINK) {
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
