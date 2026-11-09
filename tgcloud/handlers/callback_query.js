import { api } from 'sdk';
import { CONFIG } from '../lib/config.js';
import * as store from '../lib/store.js';
import * as ids from '../lib/ids.js';
import { t, normalizeLang } from '../lib/i18n.js';
import { actionKey, openAction, ownerChatId, sealAction, sealReplyTarget, linkMemo, linkToken, sealConversationChat } from '../lib/keys.js';
import { deliver, aliasFor } from '../lib/delivery.js';
import { purgeLink } from '../lib/lifecycle.js';
import { maybeSweep } from '../lib/retention.js';
import { homeMenu, linksMenu, linkMenu, editMenu, editRichMenu, requestMemo, modesMenu } from '../lib/menu.js';
import { deepLink, ownerSalt, senderKeyFor, userKeyFor } from '../lib/links.js';
import { renameWait, formatWait } from '../lib/rename.js';
import { parseModes } from '../lib/modes.js';
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
  // The batch is taken before delivery; every exit that does not deliver
  // must put it back so a retry tap finds it instead of an empty group.
  const refund = () => Promise.all(batch.map((messageId) => store.addPending({
    user_key: p.user_key,
    link_id: link.id,
    group_key: p.group_key,
    message_id: messageId,
    created_at: now,
  })));
  if (link.state !== 'active') return answer(q, t(lang, 'linkInactive'));

  const chosen = k === CALLBACK.MODE_ANON ? 'anon' : k === CALLBACK.MODE_HISTORY ? 'history' : 'forward';
  const owner = await store.getOwner(link.owner_key);
  if (!parseModes(owner?.modes).includes(chosen)) {
    return answer(q, t(lang, 'modeUnavailable'), true);
  }

  const salt = await ownerSalt();
  if (await store.isBlockedBy(link.owner_key, link.id, p.sender_key, await userKeyFor(p.sender_id, salt))) {
    await store.clearPending(p.user_key, p.group_key);
    await store.deleteActionToken(opened.row.prefix);
    return answer(q, t(lang, 'blockedNotice'));
  }

  const claimed = await store.claimPending(p.user_key, p.group_key);
  if (!claimed) return answer(q, t(lang, 'answerExpired'));

  // Commit the batch with one atomic take instead of list-then-clear: a row
  // inserted between those two statements would be deleted undelivered.
  const batch = await store.takePending(p.user_key, p.group_key);
  if (!batch.length) return answer(q, t(lang, 'answerExpired'));

  // Intake was counted when the messages arrived; count the cash-in by message
  // count (albums included) so a stockpiled chooser cannot release a day of
  // messages in one burst.
  if (CONFIG.deliverPerMinute > 0) {
    const delivered = await store.bumpRate(link.id, `out:${p.sender_key}`, now, batch.length);
    if (delivered > CONFIG.deliverPerMinute) {
      await refund();
      return answer(q, t(lang, 'throttle'));
    }
  }
  if (CONFIG.ownerPerMinute > 0) {
    const accepted = await store.bumpRate(0, link.owner_key, now, batch.length);
    if (accepted > CONFIG.ownerPerMinute) {
      await refund();
      return answer(q, t(lang, 'throttle'));
    }
  }

  // Stop the button spinner now; the success confirm below lands before any
  // delivery call, so the buttons vanish instantly. Any later failure edits
  // that same message instead of opening a new one.
  await answer(q);

  const session = await store.getSession(p.session_key ?? p.user_key);
  if (session?.link_id === link.id) await store.setSessionMode(session.user_key, chosen, now);

  let indicator = '';
  if (chosen === 'history') {
    try {
      indicator = await aliasFor(link, p.sender_key, p.first_name, p.sender_id, now);
    } catch {
      await refund();
      await api.sendMessage({
        chat_id: p.sender_id,
        ...(p.thread_id ? { message_thread_id: p.thread_id } : {}),
        text: t(lang, 'failed'),
      });
      return undefined;
    }
  }
  const text = chosen === 'anon'
    ? t(lang, 'sentAnon')
    : chosen === 'history'
      ? t(lang, 'sentHistory', { indicator: ids.escapeHtml(indicator) })
      : t(lang, 'sentForward');

  const fallbackSend = (message) => api.sendMessage({
    chat_id: q.message?.chat?.id ?? p.sender_id,
    ...(q.message?.message_thread_id ? { message_thread_id: q.message.message_thread_id } : {}),
    text: message,
    parse_mode: 'HTML',
    ...(q.message?.reply_to_message?.message_id
      ? { reply_to_message_id: q.message.reply_to_message.message_id }
      : {}),
  }).then((sent) => ({ chatId: sent.chat?.id ?? q.message?.chat?.id ?? p.sender_id, messageId: sent.message_id }));
  const confirm = async () => {
    if (!q.message?.chat?.id || !q.message?.message_id) return fallbackSend(text);
    try {
      await api.editMessageText({
        chat_id: q.message.chat.id,
        message_id: q.message.message_id,
        text,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [] },
      });
      return { chatId: q.message.chat.id, messageId: q.message.message_id };
    } catch {
      return fallbackSend(text);
    }
  };
  // Any failure from here on edits this same message instead of opening a new one.
  const failSame = (message) => api.editMessageText({
    chat_id: confirmIds.chatId,
    message_id: confirmIds.messageId,
    text: message,
  }).catch(() => fallbackSend(message));

  let confirmIds;
  try {
    confirmIds = await confirm();
  } catch {
    await refund();
    await api.sendMessage({
      chat_id: p.sender_id,
      ...(p.thread_id ? { message_thread_id: p.thread_id } : {}),
      text: t(lang, 'failed'),
    });
    return undefined;
  }

  let target;
  try {
    target = await deliver(link, p.sender_id, p.sender_key, chosen,
      batch, p.first_name, now, p.thread_id ?? 0, salt, owner, lang, confirmIds);
    // A straggler may have landed mid-delivery; ship it in the same mode
    // instead of leaving it without a prompt. It pays the same rate limits as
    // the main batch, otherwise racing messages against the tap bypasses them.
    try {
      const late = await store.takePending(p.user_key, p.group_key);
      if (late.length) {
        const lateDelivered = await store.bumpRate(link.id, `out:${p.sender_key}`, now, late.length);
        const lateOwner = await store.bumpRate(0, link.owner_key, now, late.length);
        const overLimit = (CONFIG.deliverPerMinute > 0 && lateDelivered > CONFIG.deliverPerMinute)
          || (CONFIG.ownerPerMinute > 0 && lateOwner > CONFIG.ownerPerMinute);
        if (overLimit) {
          await api.sendMessage({
            chat_id: p.sender_id,
            ...(p.thread_id ? { message_thread_id: p.thread_id } : {}),
            text: t(lang, 'albumPartialSender'),
          });
        } else {
          try {
            await deliver(link, p.sender_id, p.sender_key, chosen,
              late, p.first_name, now, p.thread_id ?? 0, salt, owner, lang, confirmIds);
            await drain(1);
          } catch {
            // The main batch already succeeded; tell the sender about the rest
            // instead of leaving it silently queued without a prompt.
            await api.sendMessage({
              chat_id: p.sender_id,
              ...(p.thread_id ? { message_thread_id: p.thread_id } : {}),
              text: t(lang, 'albumPartialSender'),
            });
          }
        }
      }
    } catch {
      // pending rows stay intact; the next drain or message handles them
    }
  } catch {
    await refund();
    await failSame(t(lang, 'failed'));
    return undefined;
  }

  if (target.pending) {
    await refund();
    await failSame(t(lang, 'preparing'));
    return undefined;
  }

  await store.deleteActionToken(opened.row.prefix);
  return undefined;
}

async function replyWindow(q, opened, lang, now) {
  const p = opened.payload;
  const link = opened.link;
  if (p.sender_key) {
    const salt = await ownerSalt();
    if (await store.isBlockedBy(link.owner_key, link.id, p.sender_key, await userKeyFor(p.sender_chat_id, salt))) {
      return answer(q, t(lang, 'blockedReply'), true);
    }
  }
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
  const sealed = await sealReplyTarget(link, {
    chat_id: p.sender_chat_id,
    thread_id: p.sender_thread_id ?? 0,
  });
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
  const salt = await ownerSalt();
  const senderKey = await senderKeyFor(opened.link, p.sender_chat_id, salt);
  if (await store.isBlockedBy(
    opened.link.owner_key,
    opened.link.id,
    senderKey,
    await userKeyFor(p.sender_chat_id, salt),
  )) {
    return answer(q, t(lang, 'blockedReply'), true);
  }
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

  const actionSealKey = await actionKey(link);
  const base = {
    link_id: link.id,
    sender_key: p.sender_key,
    sender_chat_id: p.sender_chat_id,
  };
  const [nextLink, nextAll] = await Promise.all([
    sealAction(link, 'block', { ...base, scope: 'link', blocked: !blockedLink },
      now, CONFIG.actionTtlSeconds, actionSealKey),
    sealAction(link, 'block', { ...base, scope: 'all', blocked: !blockedAll },
      now, CONFIG.actionTtlSeconds, actionSealKey),
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
        [{
          text: t(lang, 'confirm'),
          callback_data: `${CALLBACK.REVOKE_OK}${CALLBACK.SEP}${confirm.prefix}${CALLBACK.SEP}${confirm.suffix}`,
          style: 'danger',
        }],
        [{ text: t(lang, 'back'), callback_data: CALLBACK.LINKS }],
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

  if (!(await store.claimLinkPurge(link.id, now))) {
    return answer(q, t(lang, 'revokedShort'));
  }
  const fresh = await store.getLink(link.id);
  if (!fresh) return answer(q, t(lang, 'revokedShort'));
  await purgeLink(fresh, chat, owner?.lang ?? lang, now);

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
  const salt = await ownerSalt();
  const wait = await renameWait(await ownerChatId(opened.link), 'memo', now, salt);
  if (wait) return answer(q, t(lang, 'memoWait', { time: formatWait(wait) }), true);
  const openedMemo = await requestMemo(opened.link, lang, q.message?.message_thread_id ?? 0);
  if (!openedMemo) return answer(q, t(lang, 'replyBusy'), true);
  return answer(q);
}

async function toggleMode(q, mode, desired, lang) {
  if (!q.message?.chat?.id || !q.message?.message_id) return answer(q);
  if (!['anon', 'history', 'forward'].includes(mode)) return answer(q);
  if (desired !== '0' && desired !== '1') return answer(q);
  const ownerKey = await userKeyFor(q.message.chat.id);
  const owner = await store.getOwner(ownerKey);
  if (!owner) return answer(q);
  const current = parseModes(owner.modes);
  const next = desired === '1'
    ? [...new Set([...current, mode])]
    : current.filter((entry) => entry !== mode);
  if (!next.length) return answer(q, t(lang, 'modesKeepOne'), true);
  await store.setOwnerModes(ownerKey, next);
  await editMenu(q, modesMenu(lang, next));
  return answer(q);
}

async function menu(q, data, lang, now) {
  if (!q.message?.chat?.id || !q.message?.message_id) return answer(q);

  if (data === CALLBACK.HOME) {
    await editMenu(q, homeMenu(lang));
    return answer(q);
  }
  if (data === CALLBACK.MODES) {
    const owner = await store.getOwner(await userKeyFor(q.message.chat.id));
    if (!owner) return answer(q);
    await editMenu(q, modesMenu(lang, parseModes(owner.modes)));
    return answer(q);
  }
  if (data === CALLBACK.LINKS) {
    await editMenu(q, await linksMenu(lang, await userKeyFor(q.message.chat.id), now));
    return answer(q);
  }
  if (data === CALLBACK.HELP) {
    await editRichMenu(q, t(lang, 'help'), {
      inline_keyboard: [[{ text: t(lang, 'back'), callback_data: CALLBACK.HOME }]],
    }, lang === 'fa');
    return answer(q);
  }
  if (data === CALLBACK.ABOUT) {
    const links = render.aboutButtons(lang);
    await editRichMenu(q, render.about(lang), {
      inline_keyboard: [
        ...links.inline_keyboard,
        [{ text: t(lang, 'back'), callback_data: CALLBACK.HOME }],
      ],
    }, lang === 'fa');
    return answer(q);
  }
  return answer(q);
}

export default async function onCallback(update) {
  let drainLimit = 3;
  try {
    const q = update;
    if (!q?.data || !q.from) return;
    const now = nowSec();
    let lang = normalizeLang(q.from.language_code);
    if (q.message?.chat?.type === 'private') {
      const saved = await store.getMeta(`lang:${await userKeyFor(q.message.chat.id)}`);
      if (saved === 'en' || saved === 'fa') lang = saved;
    }
    const [k, prefix, suffix] = String(q.data).split(CALLBACK.SEP);

    // Unsealed menu buttons are only meaningful in the chat that owns them.
    // Sealed actions below are separately bound to their sender or owner.
    const unsealed = k.startsWith(CALLBACK.MENU_PREFIX)
      || k === CALLBACK.MODE_TOGGLE
      || k === CALLBACK.CANCEL;
    if (unsealed && Number(q.from.id) !== Number(q.message?.chat?.id)) return await answer(q);

    if (k.startsWith(CALLBACK.MENU_PREFIX)) return await menu(q, k, lang, now);
    if (k === CALLBACK.MODE_TOGGLE) return await toggleMode(q, prefix, suffix, lang);
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
      // A regenerated menu deletes the previous menu's tokens; say so instead
      // of the misleading "link not found".
      return await answer(q, t(lang, expected === 'menu' ? 'menuExpired' : 'linkNotFound'));
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
      // A mode tap enqueues exactly one job; the next update can drain backlog.
      drainLimit = 1;
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
      await drain(drainLimit);
    } catch {
      // the platform records failures; the bot writes no logs
    }
    try {
      await maybeSweep(nowSec());
    } catch {
      // retention is best effort; the next update retries after the lease
    }
  }
}
