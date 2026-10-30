import { api } from 'sdk';
import * as store from './store.js';
import * as ids from './ids.js';
import { t } from './i18n.js';
import { sealAction, linkMemo, linkToken } from './keys.js';
import { deepLink } from './links.js';
import { shareUrl } from './render.js';
import { EMOJI, CALLBACK } from './constants.js';

export function homeMenu(lang) {
  return {
    text: t(lang, 'homeTitle'),
    keyboard: {
      inline_keyboard: [
        [{ text: t(lang, 'homeLinks'), callback_data: CALLBACK.LINKS }],
        [{ text: t(lang, 'homeHelp'), callback_data: CALLBACK.HELP }],
        [{ text: t(lang, 'homeAbout'), callback_data: CALLBACK.ABOUT }],
      ],
    },
  };
}

export async function linksMenu(lang, ownerKey, now) {
  const links = await store.listLinks(ownerKey);
  const rows = [[{ text: t(lang, 'back'), callback_data: CALLBACK.HOME }]];

  if (!links.length) {
    return { text: t(lang, 'noLinks'), keyboard: { inline_keyboard: rows } };
  }

  for (const link of links) {
    await store.deleteActionTokens(link.id, 'menu');
    const menu = await sealAction(link, 'menu', { link_id: link.id }, now);
    const label = await linkMemo(link);
    rows.push([{
      text: `${EMOJI.link} ${ids.cleanLabel(label, 30)}`,
      callback_data: `${CALLBACK.MENU_LINK}${CALLBACK.SEP}${menu.prefix}${CALLBACK.SEP}${menu.suffix}`,
    }]);
  }
  return { text: t(lang, 'linksTitle'), keyboard: { inline_keyboard: rows } };
}

export async function linkMenu(lang, link, now) {
  const token = await linkToken(link);
  const url = await deepLink(token);
  const memoText = await linkMemo(link);
  await store.deleteActionTokens(link.id, 'memo');
  await store.deleteActionTokens(link.id, 'revoke');
  const memo = await sealAction(link, 'memo', { link_id: link.id }, now);
  const revoke = await sealAction(link, 'revoke', { link_id: link.id }, now);

  return {
    text: t(lang, 'linkMenuTitle', {
      memo: ids.escapeHtml(memoText),
      token: ids.escapeHtml(token),
    }),
    keyboard: {
      inline_keyboard: [
        [{ text: t(lang, 'back'), callback_data: CALLBACK.LINKS }],
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
