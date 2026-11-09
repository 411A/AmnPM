import { api } from 'sdk';
import { CONFIG } from './config.js';
import * as store from './store.js';
import * as ids from './ids.js';
import { t } from './i18n.js';
import { sealAction, linkMemo, linkToken, ownerChatId } from './keys.js';
import { deepLink } from './links.js';
import { shareUrl } from './render.js';
import { EMOJI, CALLBACK, STYLE } from './constants.js';

export function homeMenu(lang) {
  return {
    text: t(lang, 'homeTitle'),
    keyboard: {
      inline_keyboard: [
        [{ text: t(lang, 'homeLinks'), callback_data: CALLBACK.LINKS }],
        [{ text: t(lang, 'homeModes'), callback_data: CALLBACK.MODES }],
        [{ text: t(lang, 'homeLanguage'), callback_data: CALLBACK.LANGUAGE }],
        [{ text: t(lang, 'homeHelp'), callback_data: CALLBACK.HELP }],
        [{ text: t(lang, 'homeAbout'), callback_data: CALLBACK.ABOUT }],
      ],
    },
  };
}

export function languageMenu(lang, current) {
  const option = (code, label) => ({
    text: label,
    callback_data: code === 'en' ? CALLBACK.LANG_EN : CALLBACK.LANG_FA,
    ...(current === code ? { style: STYLE.enabled } : {}),
  });
  return {
    text: t(lang, 'languageTitle'),
    keyboard: {
      inline_keyboard: [
        [option('en', '🇬🇧 English'), option('fa', 'فارسی 🇮🇷')],
        [{ text: t(lang, 'back'), callback_data: CALLBACK.HOME }],
      ],
    },
  };
}

export function modesMenu(lang, modes) {
  const row = (mode, label) => [{
    text: `${modes.includes(mode) ? EMOJI.selected : EMOJI.unselected} ${label}`,
    // The button color carries the same state for clients that render it:
    // green when the mode receives messages, red when it does not.
    style: modes.includes(mode) ? STYLE.enabled : STYLE.disabled,
    callback_data: `${CALLBACK.MODE_TOGGLE}${CALLBACK.SEP}${mode}${CALLBACK.SEP}${modes.includes(mode) ? '0' : '1'}`,
  }];
  return {
    text: t(lang, 'modesTitle'),
    keyboard: {
      inline_keyboard: [
        row('anon', t(lang, 'modeAnon')),
        row('history', t(lang, 'modeHistory')),
        row('forward', t(lang, 'modeForward')),
        [{ text: t(lang, 'back'), callback_data: CALLBACK.HOME }],
      ],
    },
  };
}

export async function linksMenu(lang, ownerKey, now) {
  const links = await store.listLinks(ownerKey);
  const rows = [];

  if (!links.length) {
    return {
      text: t(lang, 'noLinks'),
      keyboard: { inline_keyboard: [[{ text: t(lang, 'back'), callback_data: CALLBACK.HOME }]] },
    };
  }

  const buttons = [];
  for (const link of links) {
    await store.deleteActionTokens(link.id, 'menu');
    const menu = await sealAction(link, 'menu', { link_id: link.id }, now);
    const label = await linkMemo(link);
    buttons.push({
      text: `${EMOJI.link} ${ids.cleanLabel(label, 18)}`,
      callback_data: `${CALLBACK.MENU_LINK}${CALLBACK.SEP}${menu.prefix}${CALLBACK.SEP}${menu.suffix}`,
    });
  }
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push([{ text: t(lang, 'back'), callback_data: CALLBACK.HOME }]);
  return { text: t(lang, 'linksTitle'), keyboard: { inline_keyboard: rows } };
}

export async function linkMenu(lang, link, now) {
  const [token, memoText] = await Promise.all([linkToken(link), linkMemo(link)]);
  const url = await deepLink(token);
  await Promise.all([
    store.deleteActionTokens(link.id, 'memo'),
    store.deleteActionTokens(link.id, 'revoke'),
  ]);
  const [memo, revoke] = await Promise.all([
    sealAction(link, 'memo', { link_id: link.id }, now),
    sealAction(link, 'revoke', { link_id: link.id }, now),
  ]);

  return {
    text: t(lang, 'linkMenuTitle', {
      memo: ids.escapeHtml(memoText),
      token: ids.escapeHtml(token),
    }),
    keyboard: {
      inline_keyboard: [
        [
          { text: t(lang, 'open'), url },
          { text: t(lang, 'share'), url: shareUrl(url) },
        ],
        [
          {
            text: `${EMOJI.memo} ${ids.cleanLabel(memoText, 20)}`,
            callback_data: `${CALLBACK.MEMO}${CALLBACK.SEP}${memo.prefix}${CALLBACK.SEP}${memo.suffix}`,
          },
          {
            text: t(lang, 'revoke'),
            callback_data: `${CALLBACK.REVOKE}${CALLBACK.SEP}${revoke.prefix}${CALLBACK.SEP}${revoke.suffix}`,
          },
        ],
        [{ text: t(lang, 'back'), callback_data: CALLBACK.LINKS }],
      ],
    },
  };
}

export async function editMenu(q, menu) {
  try {
    await api.editMessageText({
      chat_id: q.message.chat.id,
      message_id: q.message.message_id,
      text: menu.text,
      parse_mode: 'HTML',
      reply_markup: menu.keyboard,
    });
  } catch (err) {
    if (!/not modified/i.test(String(err?.description ?? err))) throw err;
  }
}

export async function editRichMenu(q, html, keyboard, rtl = false) {
  try {
    await api.editMessageText({
      chat_id: q.message.chat.id,
      message_id: q.message.message_id,
      rich_message: { html, ...(rtl ? { is_rtl: true } : {}) },
      ...(keyboard ? { reply_markup: keyboard } : {}),
    });
  } catch (err) {
    if (!/not modified/i.test(String(err?.description ?? err))) throw err;
  }
}

// Sends the memo prompt into the owner chat and remembers it, so it can be
// removed once the memo arrives. Replaces any prompt still pending. The
// prompt answers in the same topic the button was pressed in.
export async function requestMemo(link, lang, threadId = 0) {
  const chatId = await ownerChatId(link);
  const current = await store.getMemoState(link.owner_key);
  if (!(await store.claimMemo(link.owner_key, link.id))) return false;
  if (current?.memo_message_id) {
    try {
      await api.deleteMessage({ chat_id: chatId, message_id: current.memo_message_id });
    } catch {
      // already gone
    }
  }
  try {
    const sent = await api.sendMessage({
      chat_id: chatId,
      ...(threadId ? { message_thread_id: threadId } : {}),
      text: t(lang, 'memoPrompt', { max: CONFIG.maxMemoLength }),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
    await store.setMemoMessageId(link.owner_key, sent.message_id);
    return true;
  } catch {
    await store.clearMemoState(link.owner_key);
    return false;
  }
}
